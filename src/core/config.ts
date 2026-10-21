import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Arm, CtxEvalConfig } from "./types.ts";

export const DEFAULT_CONFIG: CtxEvalConfig = {
  repeats: 3,
  arms: ["none", "always-on"],
  adapter: "codex",
  contextFile: "AGENTS.md",
  timeoutMs: 15 * 60 * 1000,
  workdir: ".ctx-eval",
  marginPp: 10,
};

const VALID_ARMS: readonly Arm[] = ["none", "always-on", "selective"];

export function validateConfig(config: CtxEvalConfig): CtxEvalConfig {
  if (!Array.isArray(config.arms) || config.arms.length < 1 || config.arms.some(a=>!VALID_ARMS.includes(a)) || new Set(config.arms).size !== config.arms.length) throw new Error('arms must be unique valid arm names');
  if (!Number.isInteger(config.repeats) || config.repeats < 1) throw new Error('repeats must be a positive integer');
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) throw new Error('timeout must be positive');
  if (!Number.isFinite(config.marginPp) || config.marginPp <= 0 || config.marginPp > 100) throw new Error('margin must be within (0,100]');
  if (config.maxCostUsd !== undefined && (!Number.isFinite(config.maxCostUsd) || config.maxCostUsd < 0)) throw new Error('max-cost must be nonnegative');
  return config;
}

/** 读取仓库根 ctx-eval.json 并与默认值合并；非法字段抛错。 */
export function loadConfig(cwd: string): CtxEvalConfig {
  const file = resolve(cwd, "ctx-eval.json");
  if (!existsSync(file)) return { ...DEFAULT_CONFIG };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`ctx-eval.json 不是合法 JSON: ${(e as Error).message}`);
  }
  const merged = { ...DEFAULT_CONFIG, ...raw } as CtxEvalConfig;
  for (const arm of merged.arms) {
    if (!VALID_ARMS.includes(arm)) {
      throw new Error(`ctx-eval.json: 非法 arm "${arm}"，可选: ${VALID_ARMS.join(", ")}`);
    }
  }
  if (merged.arms.length < 2) {
    throw new Error("ctx-eval.json: arms 至少需要两个（一个 baseline 一个对照）");
  }
  if (merged.repeats < 1) throw new Error("ctx-eval.json: repeats 必须 >= 1");
  return validateConfig(merged);
}

/** 合并 CLI 覆盖项（仅覆盖显式提供的字段）。 */
export function mergeOverrides(
  config: CtxEvalConfig,
  overrides: Partial<CtxEvalConfig>,
): CtxEvalConfig {
  const out: CtxEvalConfig = { ...config };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return validateConfig(out);
}
