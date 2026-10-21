import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** 追加写入一条 JSON 记录（中间结果不丢）。 */
export function appendRecord<T>(file: string, record: T): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

/** 读取 JSONL 全部记录；文件不存在返回空数组。 */
export function readRecords<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}
