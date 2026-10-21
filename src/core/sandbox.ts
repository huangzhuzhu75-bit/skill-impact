import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import type { Arm } from "./types.ts";
import { bashCommand, runProcess } from "../adapters/util.ts";

/** Legacy name retained for compatibility; instruction contents now stay in memory. */
export const HIDDEN_CONTEXT = ".ctx-eval-context-hidden";
const removedContexts = new Map<string, Buffer>();

export function safePath(root: string, rel: string): string {
  const target = resolve(root, rel);
  const diff = relative(resolve(root), target);
  if (!diff || diff.startsWith('..') || isAbsolute(diff)) throw new Error(`Path must stay inside workspace: ${rel}`);
  return target;
}

/** 在 repoRoot 中为 baseCommit 创建 detached worktree。 */
export function createWorktree(repoRoot: string, baseCommit: string, target: string): string {
  if (existsSync(target)) {
    throw new Error(`worktree 目标已存在: ${target}`);
  }
  mkdirSync(target, { recursive: true });
  try {
    execFileSync("git", ["worktree", "add", "--detach", target, baseCommit], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch (e) {
    rmSync(target, { recursive: true, force: true });
    const msg = (e as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`创建 worktree 失败（${baseCommit}）: ${msg ?? (e as Error).message}`);
  }
  return target;
}

/** 强制清理 worktree（git 失败时退化为目录删除）。 */
export function removeWorktree(repoRoot: string, target: string): void {
  try {
    execFileSync("git", ["worktree", "remove", "--force", target], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch {
    rmSync(target, { recursive: true, force: true });
  }
}

/**
 * 按臂物化指令文件：
 * - none:      remove the selected file; retain contents in process memory for cleanup
 * - always-on: 确保原位可见
 * - selective: v0.1 退化为 always-on（记录 warning 由调用方负责）
 */
export function materializeArm(worktree: string, contextRelPath: string, arm: Arm): void {
  const ctxPath = safePath(worktree, contextRelPath);
  if (arm === "none") {
    if (existsSync(ctxPath)) {
      removedContexts.set(ctxPath, readFileSync(ctxPath));
      rmSync(ctxPath);
    }
  }
}

/**
 * 把任务资产（setup.sh 与 checks/）从任务目录复制进 worktree。
 * worktree 只是仓库的检出，任务资产不在其中，必须先暂存，
 * 否则 setup/check 会因找不到脚本而误报基础设施失败。
 */
export function stageTaskAssets(taskDir: string, worktree: string): void {
  const setup = join(taskDir, "setup.sh");
  if (existsSync(setup)) copyFileSync(setup, join(worktree, "setup.sh"));
  const checksDir = join(taskDir, "checks");
  if (existsSync(checksDir)) copyDir(checksDir, join(worktree, "checks"));
}

/** 递归复制目录（不用 cpSync：其内部扩展路径在某些 Windows 环境下不可用）。 */
function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

/** 实验后还原 worktree 状态（藏起来的指令文件改回原名）。 */
export function restoreArm(worktree: string, contextRelPath: string, _arm: Arm): void {
  const ctxPath = safePath(worktree, contextRelPath);
  const content = removedContexts.get(ctxPath);
  if (content && existsSync(worktree)) writeFileSync(ctxPath, content);
  removedContexts.delete(ctxPath);
}

/**
 * 在 worktree 中执行脚本（bash）。返回退出码。
 * 退出码约定：0 = 成功；1 = 失败；>= 2 = 脚本自身错误（调用方记 null）。
 *
 * 注意：必须传相对路径——Windows 绝对路径的反斜杠会被 bash 当作转义符，
 * 导致 "No such file or directory"（退出码 127）被误判为脚本错误。
 */
export function runScript(worktree: string, scriptRel: string, timeoutMs: number): number {
  const script = scriptRel.replace(/\\/g, "/");
  safePath(worktree, script);
  const isNode = /\.(mjs|cjs|js|ts)$/.test(script);
  const proc = runProcess(isNode ? process.execPath : bashCommand(), [script], { cwd: worktree, timeoutMs });
  return proc.exitCode ?? (proc.timedOut ? 124 : 2);
}

/** 校验 repoRoot 是 git 仓库且 baseCommit 可解析。 */
export function assertGitRepo(repoRoot: string, baseCommit: string): void {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${baseCommit}^{commit}`], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch (e) {
    const msg = (e as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`不是合法 git 仓库或 commit 不存在（${repoRoot} @ ${baseCommit}）: ${msg ?? (e as Error).message}`);
  }
}

/** 获取当前 HEAD 的 sha（用于 RunRecord 溯源）。 */
export function headSha(repoRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
