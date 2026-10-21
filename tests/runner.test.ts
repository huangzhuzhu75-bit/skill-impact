import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExperiment } from "../src/core/runner.ts";
import { compareArms } from "../src/core/stats.ts";
import type { AdapterRunInput, AdapterRunOutput, AgentAdapter } from "../src/adapters/types.ts";
import type { Arm, CtxEvalConfig, Task } from "../src/core/types.ts";

/** 记录每个臂运行时指令文件是否可见（验证 none 臂的物化） */
const seenContext = new Map<Arm, boolean>();

/** Mock 适配器：模拟"有指令文件时做对、没有时做错"的 Agent。 */
class MockAdapter implements AgentAdapter {
  name = "mock";
  calls = 0;
  async available(): Promise<boolean> {
    return true;
  }
  installHint(): string {
    return "";
  }
  async run(input: AdapterRunInput): Promise<AdapterRunOutput> {
    this.calls += 1;
    const contextVisible = existsSync(join(input.worktree, "AGENTS.md"));
    seenContext.set(input.arm, contextVisible);
    writeFileSync(
      join(input.worktree, "hello.txt"),
      contextVisible ? "hello from agent" : "wrong content",
    );
    // Tampering with the staged checker must not turn a wrong solution into a pass.
    writeFileSync(join(input.worktree,'checks','check.mjs'),'process.exit(0);');
    const out: AdapterRunOutput = { durationMs: 10, exitCode: 0, completed: true, costUsd: 0.5 };
    return out;
  }
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "ctx-eval-run-"));
  writeFileSync(join(root, "AGENTS.md"), "# AGENTS\n\nAlways create hello.txt with the exact text.\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", "init"],
    { cwd: root },
  );
  return root;
}

function makeTask(): Task {
  const dir = mkdtempSync(join(tmpdir(), "ctx-eval-task-"));
  mkdirSync(join(dir, "checks"), { recursive: true });
  writeFileSync(
    join(dir, "task.json"),
    JSON.stringify({ id: "hello", title: "create hello.txt", checks: ["checks/check.mjs"] }),
  );
  writeFileSync(join(dir, "prompt.md"), "Create hello.txt with the exact text 'hello from agent'.\n");
  writeFileSync(
    join(dir, "checks", "check.mjs"),
    `import {existsSync,readFileSync} from 'node:fs'; process.exit(existsSync('hello.txt') && readFileSync('hello.txt','utf8') === 'hello from agent' ? 0 : 1);`,
  );
  return { dir, meta: { id: "hello", title: "create hello.txt", checks: ["checks/check.mjs"] }, prompt: "x" };
}

const config: CtxEvalConfig = {
  repeats: 2,
  arms: ["none", "always-on"],
  adapter: "mock",
  contextFile: "AGENTS.md",
  timeoutMs: 30_000,
  workdir: ".ctx-eval",
  marginPp: 10,
};

test("runExperiment 端到端：worktree 隔离 + 臂物化 + 判定 + 统计", async () => {
  const repo = makeRepo();
  const task = makeTask();
  seenContext.clear();
  try {
    const adapter = new MockAdapter();
    const record = await runExperiment({
      repoRoot: repo,
      baseCommit: "HEAD",
      tasks: [task],
      config,
      adapter,
    });

    // 4 个 trial（2 臂 × 2 重复）
    assert.equal(record.trials.length, 4);
    assert.equal(adapter.calls, 4);
    assert.equal(record.complete, true);

    // none 臂看不到指令文件且判定失败；always-on 看到且判定通过
    assert.equal(seenContext.get("none"), false, "none 臂的 AGENTS.md 应被隐藏");
    assert.equal(seenContext.get("always-on"), true, "always-on 臂的 AGENTS.md 应可见");
    for (const t of record.trials) {
      assert.ok(!t.worktree!.startsWith(repo), 'trial worktree must not inherit the source repository AGENTS.md as an ancestor');
      if (t.arm === "none") assert.equal(t.passed, false, "none 臂应失败");
      if (t.arm === "always-on") assert.equal(t.passed, true, "always-on 臂应通过");
    }

    // worktree 已全部清理
    const list = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(list.trim().split("\n").filter((l) => l.startsWith("worktree ")).length, 1);

    // 统计：always-on 100% vs none 0% → +100pp，判定为提升而非等价
    const c = compareArms(record, "always-on", "none", 10);
    assert.equal(c.passRateDiffPp, 100);
    assert.equal(c.tost.equivalent, false);
    assert.ok(c.costDeltaUsd !== undefined);

    // 指令文件在实验后还原
    assert.ok(existsSync(join(repo, "AGENTS.md")), "实验后 AGENTS.md 应还原");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(task.dir, { recursive: true, force: true });
  }
});

test("runExperiment: check 崩溃记 passed=null 而非 false", async () => {
  const repo = makeRepo();
  const task = makeTask();
  // 替换为必崩的 check
  writeFileSync(
    join(task.dir, "checks", "check.mjs"),
    `console.error('boom'); process.exit(2);`,
  );
  try {
    const record = await runExperiment({
      repoRoot: repo,
      baseCommit: "HEAD",
      tasks: [task],
      config: { ...config, arms: ["always-on"], repeats: 1 },
      adapter: new MockAdapter(),
    });
    assert.equal(record.trials.length, 1);
    assert.equal(record.trials[0].passed, null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(task.dir, { recursive: true, force: true });
  }
});

test("runExperiment: 成本闸门为 0 时不启动任何 Agent 调用", async () => {
  const repo = makeRepo();
  const task = makeTask();
  try {
    const adapter = new MockAdapter();
    const record = await runExperiment({
      repoRoot: repo,
      baseCommit: "HEAD",
      tasks: [task],
      config: { ...config, arms: ["always-on"], repeats: 3, maxCostUsd: 0 },
      adapter,
    });
    assert.equal(adapter.calls, 0);
    assert.equal(record.complete, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(task.dir, { recursive: true, force: true });
  }
});
