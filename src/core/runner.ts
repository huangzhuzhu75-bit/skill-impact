import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from 'node:os';
import type {
  Arm,
  CtxEvalConfig,
  RunRecord,
  Task,
  TrialResult,
} from "./types.ts";
import {
  assertGitRepo,
  createWorktree,
  headSha,
  materializeArm,
  removeWorktree,
  restoreArm,
  runScript,
  stageTaskAssets,
  safePath,
} from "./sandbox.ts";
import type { AgentAdapter } from "../adapters/types.ts";

export interface RunOptions {
  repoRoot: string;
  baseCommit: string;
  tasks: Task[];
  config: CtxEvalConfig;
  adapter: AgentAdapter;
  /** 每个 trial 完成后的回调（用于进度显示与增量持久化） */
  onTrial?: (trial: TrialResult) => void;
}

export class CostLimitExceeded extends Error {
  spentUsd: number;
  limitUsd: number;
  constructor(spentUsd: number, limitUsd: number) {
    super(`成本闸门触发: 已花费 $${spentUsd.toFixed(2)} / 上限 $${limitUsd.toFixed(2)}`);
    this.name = "CostLimitExceeded";
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
  }
}

/**
 * 实验编排：tasks × arms × repeats。
 *
 * 每个 trial 独立 worktree；失败不中断实验（记 passed=null）；
 * 成本超限即中止并标记 complete=false。
 */
export async function runExperiment(opts: RunOptions): Promise<RunRecord> {
  const { repoRoot, baseCommit, tasks, config, adapter } = opts;
  const startedAt = new Date().toISOString();
  safePath(repoRoot, config.workdir);
  safePath(repoRoot, config.contextFile);
  assertGitRepo(repoRoot, baseCommit);

  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const workRoot = mkdtempSync(join(tmpdir(), 'ctx-eval-sandboxes-'));
  const manifest = {
    nodeVersion:process.version,platform:process.platform,
    configuration:{...config,arms:[...config.arms]},
    taskPrompts:tasks.map(task=>({taskId:task.meta.id,sha256:createHash('sha256').update(task.prompt).digest('hex')})),
    isolation:'Temporary worktrees outside source repository; global instructions and Git history are not blocked.'
  };
  const trials: TrialResult[] = [];
  let spentUsd = 0;
  let complete = true;

  try {
  for (const task of tasks) {
    for (const arm of config.arms) {
      for (let repeat = 1; repeat <= config.repeats; repeat++) {
        if (config.maxCostUsd !== undefined && spentUsd >= config.maxCostUsd) {
          complete = false;
          opts.onTrial?.({
            taskId: task.meta.id,
            arm,
            repeat,
            passed: null,
            durationMs: 0,
            error: "成本闸门触发，实验未启动",
          });
          return {...finalize(runId, repoRoot, baseCommit, config, adapter, trials, complete), startedAt, manifest};
        }

        const timeoutMs = task.meta.timeoutMs ?? config.timeoutMs;
        const worktree = join(workRoot, `${task.meta.id}-${arm}-${repeat}-${randomUUID().slice(0, 8)}`);
        const trial: TrialResult = {
          taskId: task.meta.id,
          arm,
          repeat,
          passed: null,
          durationMs: 0,
          worktree,
        };
        const started = Date.now();
        try {
          createWorktree(repoRoot, task.meta.baseCommit ?? baseCommit, worktree);
          const contextPath=safePath(worktree,config.contextFile);
          if(existsSync(contextPath)) trial.contextSha256=createHash('sha256').update(readFileSync(contextPath)).digest('hex');
          materializeArm(worktree, config.contextFile, arm);
          // 任务资产（setup.sh / checks/）不在仓库检出中，先暂存进 worktree
          stageTaskAssets(task.dir, worktree);

          // 可选 setup 脚本（退出码 >= 2 视为基础设施失败）
          const setupScript = join(task.dir, "setup.sh");
          if (existsSync(setupScript)) {
            const code = runScript(worktree, "setup.sh", timeoutMs);
            if (code !== 0) {
              throw new Error(`setup.sh 执行错误（退出码 ${code}）`);
            }
          }

          const out = await adapter.run({
            worktree,
            prompt: task.prompt,
            arm,
            timeoutMs,
            model: config.model,
            transcriptDir:join(repoRoot,config.workdir,'raw'),
          });
          trial.durationMs = out.durationMs || Date.now() - started;
          trial.costUsd = out.costUsd;
          trial.tokensIn = out.tokensIn;
          trial.tokensOut = out.tokensOut;
          trial.transcriptPath = out.transcriptPath;

          if (out.error || out.exitCode !== 0 || out.completed === false) {
            trial.error = out.error ?? `Agent did not complete successfully (exit ${out.exitCode}).`;
          } else {
            // Refresh external task assets after the agent; it must not rewrite its own grader.
            stageTaskAssets(task.dir, worktree);
            trial.passed = runChecks(worktree, task, timeoutMs);
          }
          if (out.costUsd) spentUsd += out.costUsd;
        } catch (e) {
          trial.durationMs = Date.now() - started;
          trial.error = (e as Error).message;
          trial.passed = null;
        } finally {
          try { restoreArm(worktree, config.contextFile, arm); }
          finally { removeWorktree(repoRoot, worktree); }
          trials.push(trial);
          opts.onTrial?.(trial);
        }
      }
    }
  }

  return {...finalize(runId, repoRoot, baseCommit, config, adapter, trials, complete), startedAt, manifest};
  } finally {
    // workRoot comes directly from mkdtempSync, never from task/user input.
    rmSync(workRoot,{recursive:true,force:true});
  }
}

/** 依次执行 checks；全部退出码 0 记 true；任一失败记 false；脚本错误(>=2)记 null。 */
function runChecks(worktree: string, task: Task, timeoutMs: number): boolean | null {
  for (const rel of task.meta.checks) {
    const code = runScript(worktree, rel, timeoutMs);
    if (code === 0) continue;
    if (code === 1) return false;
    return null; // >= 2 或信号终止：基础设施失败
  }
  return true;
}

function finalize(
  runId: string,
  repoRoot: string,
  baseCommit: string,
  config: CtxEvalConfig,
  adapter: AgentAdapter,
  trials: TrialResult[],
  complete: boolean,
): RunRecord {
  return {
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    complete,
    adapter: adapter.name,
    model: config.model,
    contextFile: config.contextFile,
    repoRoot,
    baseCommit,
    gitSha: headSha(repoRoot),
    trials,
  };
}

/** 确保 .ctx-eval 目录结构存在。 */
export function ensureWorkdir(repoRoot: string, workdir: string): string {
  const dir = join(repoRoot, workdir);
  mkdirSync(join(dir, "runs"), { recursive: true });
  return dir;
}

export type { Arm };
