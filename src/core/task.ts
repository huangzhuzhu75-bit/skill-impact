import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Task, TaskMeta } from "./types.ts";

/** 任务目录规范违反时抛出，消息必须包含具体路径。 */
export class TaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskError";
  }
}

/** 加载并校验单个任务目录。 */
export function loadTask(dir: string): Task {
  const abs = resolve(dir);

  const metaPath = join(abs, "task.json");
  if (!existsSync(metaPath)) {
    throw new TaskError(`任务目录缺少 task.json: ${metaPath}`);
  }
  let meta: TaskMeta;
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf8")) as TaskMeta;
  } catch (e) {
    throw new TaskError(`task.json 不是合法 JSON (${metaPath}): ${(e as Error).message}`);
  }
  validateMeta(meta, abs);

  const promptPath = join(abs, "prompt.md");
  if (!existsSync(promptPath)) {
    throw new TaskError(`任务目录缺少 prompt.md: ${promptPath}`);
  }
  const prompt = readFileSync(promptPath, "utf8").trim();
  if (prompt.length === 0) {
    throw new TaskError(`prompt.md 为空: ${promptPath}`);
  }

  return { dir: abs, meta, prompt };
}

function validateMeta(meta: TaskMeta, dir: string): void {
  if (!meta || typeof meta !== "object") {
    throw new TaskError(`task.json 必须是对象: ${dir}`);
  }
  if (typeof meta.id !== "string" || meta.id.trim() === "") {
    throw new TaskError(`task.json: id 必填且为非空字符串 (${dir})`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(meta.id)) throw new TaskError(`Unsafe task id: ${meta.id}`);
  if (typeof meta.title !== "string" || meta.title.trim() === "") {
    throw new TaskError(`task.json: title 必填且为非空字符串 (${dir})`);
  }
  if (!Array.isArray(meta.checks) || meta.checks.length === 0) {
    throw new TaskError(`task.json: checks 必须是非空数组 (${dir})`);
  }
  for (const c of meta.checks) {
    if (typeof c !== "string") {
      throw new TaskError(`task.json: checks 元素必须是字符串 (${dir})`);
    }
    const abs = join(dir, c);
    if (!existsSync(abs)) {
      throw new TaskError(`task.json: check 脚本不存在: ${abs}`);
    }
  }
}

/**
 * 扫描 root 的直接子目录，加载所有含 task.json 的任务。
 * 一个任务加载失败即整体抛错（避免静默跳过导致实验结论偏差）。
 */
export function loadTasks(root: string): Task[] {
  const abs = resolve(root);
  if (!existsSync(abs)) {
    throw new TaskError(`任务目录不存在: ${abs}`);
  }
  const tasks: Task[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(abs, entry.name);
    if (existsSync(join(candidate, "task.json"))) {
      tasks.push(loadTask(candidate));
    }
  }
  if (tasks.length === 0) {
    throw new TaskError(`${abs} 下没有找到任何任务（子目录需包含 task.json）`);
  }
  if (new Set(tasks.map(t=>t.meta.id)).size !== tasks.length) throw new TaskError('Duplicate task ids');
  return tasks;
}
