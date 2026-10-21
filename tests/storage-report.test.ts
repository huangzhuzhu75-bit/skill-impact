import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRecord, readRecords } from "../src/storage/jsonl.ts";
import { compareArms } from "../src/core/stats.ts";
import { renderMarkdown, renderTerminal } from "../src/core/report.ts";
import type { Arm, RunRecord, TrialResult } from "../src/core/types.ts";

test("JSONL 追加与读取（round-trip）", () => {
  const root = mkdtempSync(join(tmpdir(), "ctx-eval-store-"));
  try {
    const file = join(root, "nested", "dir", "records.jsonl");
    appendRecord(file, { a: 1 });
    appendRecord(file, { a: 2 });
    appendRecord(file, { a: 3 });
    assert.deepEqual(readRecords<{ a: number }>(file), [{ a: 1 }, { a: 2 }, { a: 3 }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readRecords 文件不存在返回空数组", () => {
  assert.deepEqual(readRecords(join(tmpdir(), "definitely-not-here-12345.jsonl")), []);
});

function makeRecord(): RunRecord {
  const trials: TrialResult[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `task-${i}`;
    const same = i % 2 === 0;
    trials.push({ taskId: id, arm: "none" as Arm, repeat: 1, passed: same, durationMs: 1000, costUsd: 0.4 });
    trials.push({ taskId: id, arm: "always-on" as Arm, repeat: 1, passed: same, durationMs: 1100, costUsd: 0.5 });
  }
  return {
    runId: "run-2026-10-21T00-00-00-000Z",
    startedAt: "2026-10-21T00:00:00.000Z",
    finishedAt: "2026-10-21T00:10:00.000Z",
    complete: true,
    adapter: "mock",
    contextFile: "AGENTS.md",
    repoRoot: "/tmp/repo",
    baseCommit: "abc123def456abc",
    trials,
  };
}

test("renderMarkdown 包含报告全部关键区块", () => {
  const record = makeRecord();
  const c = compareArms(record, "always-on", "none", 10);
  const md = renderMarkdown(record, c);
  assert.match(md, /# ctx-eval report/);
  assert.match(md, /Arm comparison/);
  assert.match(md, /Paired difference/);
  assert.match(md, /TOST/);
  assert.match(md, /Verdict/);
  assert.match(md, /ctx-eval/);
  // 无差异 + 成本上升 → 应给出"不可测收益"结论
  assert.match(md, /no measurable benefit/i);
  assert.match(md, /Cost is up/);
});

test("renderTerminal 是简短摘要", () => {
  const record = makeRecord();
  const c = compareArms(record, "always-on", "none", 10);
  const t = renderTerminal(c);
  assert.match(t, /paired diff/);
  assert.match(t, /TOST/);
  assert.ok(t.split("\n").length < 15, "终端摘要应短小");
});
