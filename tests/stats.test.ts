import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armStats,
  bootstrapCI,
  buildPairs,
  compareArms,
  isRegression,
  passRateDiffPp,
  tost,
} from "../src/core/stats.ts";
import type { Arm, RunRecord, TrialResult } from "../src/core/types.ts";

function trial(
  taskId: string,
  arm: Arm,
  repeat: number,
  passed: boolean | null,
  costUsd?: number,
): TrialResult {
  return { taskId, arm, repeat, passed, durationMs: 1000, costUsd };
}

function makeRecord(trials: TrialResult[]): RunRecord {
  return {
    runId: "test-run",
    startedAt: "2026-10-21T00:00:00.000Z",
    finishedAt: "2026-10-21T00:10:00.000Z",
    complete: true,
    adapter: "mock",
    contextFile: "AGENTS.md",
    repoRoot: "/tmp/repo",
    baseCommit: "abc123def456",
    trials,
  };
}

/** 构造 n 个配对任务：win 个任务 arm 过 baseline 不过，其余两臂相同。 */
function pairedTrials(n: number, win: number, lose: number, arm: Arm = "always-on"): TrialResult[] {
  const out: TrialResult[] = [];
  for (let i = 0; i < n; i++) {
    const id = `task-${i}`;
    const armPass = i < win ? true : i < win + lose ? false : i % 2 === 0;
    const basePass = i < win ? false : i % 2 === 0;
    out.push(trial(id, "none", 1, basePass, 0.4));
    out.push(trial(id, arm, 1, armPass, 0.5));
  }
  return out;
}

test("buildPairs 只保留两臂都有有效结果的配对，并丢弃 null", () => {
  const record = makeRecord([
    trial("t1", "none", 1, true),
    trial("t1", "always-on", 1, true),
    trial("t2", "none", 1, false),
    // t2 的 always-on 缺失 → 不成对
    trial("t3", "none", 1, null), // 基础设施失败 → 丢弃
    trial("t3", "always-on", 1, true),
    trial("t4", "none", 2, true),
    trial("t4", "always-on", 2, false),
  ]);
  const pairs = buildPairs(record, "always-on", "none");
  assert.equal(pairs.length, 2);
  assert.deepEqual(
    pairs.map((p) => p.taskId).sort(),
    ["t1", "t4"],
  );
});

test("passRateDiffPp 计算配对差（百分点）", () => {
  const record = makeRecord(pairedTrials(10, 4, 0));
  const pairs = buildPairs(record, "always-on", "none");
  // 4 个 +1，其余为 0 → +40pp
  assert.equal(passRateDiffPp(pairs), 40);
});

test("bootstrapCI 可复现（同 seed 同结果）且包含真实差值", () => {
  const record = makeRecord(pairedTrials(12, 8, 0));
  const pairs = buildPairs(record, "always-on", "none");
  const a = bootstrapCI(pairs, 2000);
  const b = bootstrapCI(pairs, 2000);
  assert.deepEqual(a, b);
  const diff = passRateDiffPp(pairs); // 8/12 ≈ 66.7pp
  assert.ok(a[0] <= diff && diff <= a[1], `CI [${a}] 应包含 ${diff}`);
  assert.ok(a[0] > 0, "强正向效应的 CI 下界应大于 0");
});

test("TOST: 明显提升时判定不等价", () => {
  const record = makeRecord(pairedTrials(12, 8, 0));
  const pairs = buildPairs(record, "always-on", "none");
  const t = tost(pairs, 10, 2000);
  assert.equal(t.equivalent, false);
  assert.equal(t.marginPp, 10);
});

test("TOST: 两臂无差异时判定等价", () => {
  const trials: TrialResult[] = [];
  for (let i = 0; i < 10; i++) {
    const same = i % 3 !== 0;
    trials.push(trial(`task-${i}`, "none", 1, same, 0.4));
    trials.push(trial(`task-${i}`, "always-on", 1, same, 0.5));
  }
  const record = makeRecord(trials);
  const pairs = buildPairs(record, "always-on", "none");
  const t = tost(pairs, 10, 2000);
  assert.equal(passRateDiffPp(pairs), 0);
  assert.equal(t.equivalent, true);
});

test("compareArms 汇总臂统计与成本差", () => {
  const record = makeRecord(pairedTrials(10, 4, 0));
  const c = compareArms(record, "always-on", "none", 10);
  assert.equal(c.arm, "always-on");
  assert.equal(c.baseline, "none");
  assert.equal(c.pairs, 10);
  assert.equal(c.arms.length, 2);
  const always = c.arms.find((s) => s.arm === "always-on")!;
  const none = c.arms.find((s) => s.arm === "none")!;
  assert.equal(always.n, 10);
  assert.equal(none.n, 10);
  assert.ok(c.costDeltaUsd !== undefined && c.costDeltaUsd > 0, "always-on 更贵");
  assert.ok(c.costDeltaPct !== undefined && c.costDeltaPct > 0);
});

test("isRegression: 只有 CI 下界跌破 -margin 才判定回归", () => {
  const good = compareArms(makeRecord(pairedTrials(10, 4, 0)), "always-on", "none", 10);
  assert.equal(isRegression(good), false);
  // 反向构造：arm 全败、baseline 全胜
  const badTrials: TrialResult[] = [];
  for (let i = 0; i < 10; i++) {
    badTrials.push(trial(`task-${i}`, "none", 1, true, 0.4));
    badTrials.push(trial(`task-${i}`, "always-on", 1, false, 0.5));
  }
  const bad = compareArms(makeRecord(badTrials), "always-on", "none", 10);
  assert.equal(isRegression(bad), true);
});

test("armStats 忽略 passed=null 的 trial", () => {
  const record = makeRecord([
    trial("t1", "none", 1, true),
    trial("t2", "none", 1, null),
    trial("t3", "none", 1, false),
  ]);
  const s = armStats(record, "none");
  assert.equal(s.n, 2);
  assert.equal(s.passed, 1);
  assert.equal(s.passRate, 0.5);
});
