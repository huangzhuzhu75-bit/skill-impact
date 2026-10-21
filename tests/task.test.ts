import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskError, loadTask, loadTasks } from "../src/core/task.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ctx-eval-test-"));
}

function validTaskDir(root: string, name: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "checks"), { recursive: true });
  writeFileSync(
    join(dir, "task.json"),
    JSON.stringify({ id: name, title: "t", checks: ["checks/check.sh"] }),
  );
  writeFileSync(join(dir, "prompt.md"), "do the thing\n");
  writeFileSync(join(dir, "checks", "check.sh"), "#!/usr/bin/env bash\nexit 0\n");
  return dir;
}

test("loadTask 加载合法任务", () => {
  const root = tmp();
  try {
    const dir = validTaskDir(root, "ok-task");
    const task = loadTask(dir);
    assert.equal(task.meta.id, "ok-task");
    assert.equal(task.prompt, "do the thing");
    assert.equal(task.meta.checks.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadTask: 缺少 task.json 抛 TaskError", () => {
  const root = tmp();
  try {
    const dir = join(root, "no-meta");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.md"), "x\n");
    assert.throws(() => loadTask(dir), (e: Error) => e instanceof TaskError && /task\.json/.test(e.message));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadTask: 缺少 prompt.md 抛 TaskError", () => {
  const root = tmp();
  try {
    const dir = join(root, "no-prompt");
    mkdirSync(join(dir, "checks"), { recursive: true });
    writeFileSync(join(dir, "checks", "check.sh"), "exit 0\n");
    writeFileSync(
      join(dir, "task.json"),
      JSON.stringify({ id: "x", title: "t", checks: ["checks/check.sh"] }),
    );
    assert.throws(() => loadTask(dir), (e: Error) => e instanceof TaskError && /prompt\.md/.test(e.message));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadTask: 空 prompt.md 抛 TaskError", () => {
  const root = tmp();
  try {
    const dir = join(root, "empty-prompt");
    mkdirSync(join(dir, "checks"), { recursive: true });
    writeFileSync(join(dir, "checks", "check.sh"), "exit 0\n");
    writeFileSync(
      join(dir, "task.json"),
      JSON.stringify({ id: "x", title: "t", checks: ["checks/check.sh"] }),
    );
    writeFileSync(join(dir, "prompt.md"), "   \n\n");
    assert.throws(() => loadTask(dir), (e: Error) => e instanceof TaskError && /为空/.test(e.message));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadTask: checks 脚本不存在抛 TaskError", () => {
  const root = tmp();
  try {
    const dir = join(root, "missing-check");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "task.json"),
      JSON.stringify({ id: "x", title: "t", checks: ["checks/nope.sh"] }),
    );
    writeFileSync(join(dir, "prompt.md"), "x\n");
    assert.throws(() => loadTask(dir), (e: Error) => e instanceof TaskError && /nope\.sh/.test(e.message));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadTask: task.json 非法 JSON 抛 TaskError", () => {
  const root = tmp();
  try {
    const dir = join(root, "bad-json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "task.json"), "{ not json");
    writeFileSync(join(dir, "prompt.md"), "x\n");
    assert.throws(() => loadTask(dir), (e: Error) => e instanceof TaskError && /JSON/.test(e.message));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadTasks 批量加载并跳过无 task.json 的目录", () => {
  const root = tmp();
  try {
    validTaskDir(root, "task-a");
    validTaskDir(root, "task-b");
    mkdirSync(join(root, "not-a-task"), { recursive: true }); // 无 task.json
    writeFileSync(join(root, "stray-file.md"), "hello");
    const tasks = loadTasks(root);
    assert.equal(tasks.length, 2);
    assert.deepEqual(
      tasks.map((t) => t.meta.id).sort(),
      ["task-a", "task-b"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadTasks: 目录为空抛 TaskError", () => {
  const root = tmp();
  try {
    assert.throws(() => loadTasks(root), (e: Error) => e instanceof TaskError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
