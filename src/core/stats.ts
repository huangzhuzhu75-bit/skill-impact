import type {
  Arm,
  ArmStats,
  ComparisonReport,
  PairedSample,
  RunRecord,
  TostResult,
  TrialResult,
} from "./types.ts";

/**
 * 统计层：配对差 + 任务聚类 bootstrap + TOST 等价检验。
 *
 * 设计依据（Khatri, arXiv:2607.27250）：
 * - 任务级方差占主导，因此以 task 为簇做 cluster bootstrap；
 * - 小样本下报告区间而非点估计；等价判定用双单侧检验（TOST）框架——
 *   95% CI 完全落入 ±margin 即判定"无可测收益"。
 */

/** 从 RunRecord 中提取配对样本（同一 taskId+repeat，两臂 passed 均非 null）。 */
export function buildPairs(record: RunRecord, arm: Arm, baseline: Arm): PairedSample[] {
  const key = (t: TrialResult): string => `${t.taskId}::${t.repeat}`;
  const armMap = new Map<string, boolean>();
  for (const t of record.trials) {
    if (t.arm !== arm || t.passed === null) continue;
    armMap.set(key(t), t.passed);
  }
  const pairs: PairedSample[] = [];
  for (const t of record.trials) {
    if (t.arm !== baseline || t.passed === null) continue;
    const armPassed = armMap.get(key(t));
    if (armPassed === undefined) continue;
    pairs.push({
      taskId: t.taskId,
      repeat: t.repeat,
      baseline: t.passed,
      arm: armPassed,
    });
  }
  return pairs;
}

/** 配对差（百分点）：arm 通过率 − baseline 通过率。 */
export function passRateDiffPp(samples: PairedSample[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce(
    (acc, s) => acc + (s.arm ? 1 : 0) - (s.baseline ? 1 : 0),
    0,
  );
  return (sum / samples.length) * 100;
}

/** 线性同余 RNG（可复现：同一 seed 同一结果，测试依赖此性质）。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

/**
 * 任务聚类 bootstrap：以 task 为簇有放回重抽，汇总簇内全部配对样本计算差值。
 * 返回差值的百分位 CI（百分点）。
 */
export function bootstrapCI(
  samples: PairedSample[],
  iterations = 10_000,
  alpha = 0.05,
  seed = 42,
): [number, number] {
  if (samples.length === 0) return [0, 0];
  const byTask = new Map<string, PairedSample[]>();
  for (const s of samples) {
    const list = byTask.get(s.taskId);
    if (list) list.push(s);
    else byTask.set(s.taskId, [s]);
  }
  const clusters = [...byTask.values()];
  const rng = lcg(seed);
  const diffs: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    let n = 0;
    for (let c = 0; c < clusters.length; c++) {
      const cluster = clusters[Math.floor(rng() * clusters.length)];
      for (const s of cluster) {
        sum += (s.arm ? 1 : 0) - (s.baseline ? 1 : 0);
        n += 1;
      }
    }
    diffs.push(n > 0 ? (sum / n) * 100 : 0);
  }
  diffs.sort((a, b) => a - b);
  return [percentile(diffs, alpha / 2), percentile(diffs, 1 - alpha / 2)];
}

/**
 * TOST 等价检验：95% CI 完全落入 ±marginPp → equivalent=true。
 * pLower/pUpper 为 bootstrap 分布落入边界的比例（单侧 p 的近似）。
 */
export function tost(samples: PairedSample[], marginPp: number, iterations = 10_000): TostResult {
  const ci95 = bootstrapCI(samples, iterations);
  const rng = lcg(42);
  const byTask = new Map<string, PairedSample[]>();
  for (const s of samples) {
    const list = byTask.get(s.taskId);
    if (list) list.push(s);
    else byTask.set(s.taskId, [s]);
  }
  const clusters = [...byTask.values()];
  let below = 0;
  let above = 0;
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    let n = 0;
    for (let c = 0; c < clusters.length; c++) {
      const cluster = clusters[Math.floor(rng() * clusters.length)];
      for (const s of cluster) {
        sum += (s.arm ? 1 : 0) - (s.baseline ? 1 : 0);
        n += 1;
      }
    }
    const d = n > 0 ? (sum / n) * 100 : 0;
    if (d <= -marginPp) below += 1;
    if (d >= marginPp) above += 1;
  }
  return {
    marginPp,
    equivalent: new Set(samples.map(s => s.taskId)).size >= 2 && ci95[0] > -marginPp && ci95[1] < marginPp,
    ci95,
    iterations,
    pLower: below / iterations,
    pUpper: above / iterations,
  };
}

/** 单臂统计（有效 trial：passed 非 null）。 */
export function armStats(record: RunRecord, arm: Arm): ArmStats {
  const allTrials = record.trials.filter((t) => t.arm === arm);
  const trials = allTrials.filter(t => t.passed !== null);
  const costs = allTrials.map((t) => t.costUsd).filter((c): c is number => c !== undefined);
  const durations = trials.map((t) => t.durationMs);
  return {
    arm,
    n: trials.length,
    passed: trials.filter((t) => t.passed === true).length,
    passRate: trials.length > 0 ? trials.filter((t) => t.passed === true).length / trials.length : 0,
    meanCostUsd: costs.length > 0 && costs.length === allTrials.length ? costs.reduce((a, b) => a + b, 0) / costs.length : undefined,
    meanDurationMs:
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : undefined,
  };
}

/** 完整对比：配对差 + CI + TOST + 各臂统计 + 成本差。 */
export function compareArms(
  record: RunRecord,
  arm: Arm,
  baseline: Arm,
  marginPp: number,
): ComparisonReport {
  const samples = buildPairs(record, arm, baseline);
  const armStat = armStats(record, arm);
  const baseStat = armStats(record, baseline);
  const arms = [...new Set(record.trials.map((t) => t.arm))].map((a) => armStats(record, a));

  let costDeltaUsd: number | undefined;
  let costDeltaPct: number | undefined;
  if (armStat.meanCostUsd !== undefined && baseStat.meanCostUsd !== undefined) {
    costDeltaUsd = armStat.meanCostUsd - baseStat.meanCostUsd;
    if (baseStat.meanCostUsd > 0) {
      costDeltaPct = (costDeltaUsd / baseStat.meanCostUsd) * 100;
    }
  }

  return {
    runId: record.runId,
    arm,
    baseline,
    pairs: samples.length,
    passRateDiffPp: passRateDiffPp(samples),
    tost: tost(samples, marginPp),
    arms,
    costDeltaUsd,
    costDeltaPct,
  };
}

/** 门禁判定：当前 run 相对 baseline 是否出现超出容差的回归。 */
export function isRegression(comparison: ComparisonReport): boolean {
  return comparison.tost.ci95[0] < -comparison.tost.marginPp;
}
