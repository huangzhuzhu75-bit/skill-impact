/**
 * ctx-eval 数据契约 —— 所有模块的输入输出都是这些类型的子集。
 * 代码即契约：变更需同步 docs/PRD.md 与 docs/ARCHITECTURE.md。
 */

/** 实验臂：指令文件的三种注入策略 */
export type Arm = "none" | "always-on" | "selective";

/** 任务元数据（task.json） */
export interface TaskMeta {
  /** 任务唯一标识 */
  id: string;
  /** 人类可读标题 */
  title: string;
  /** 判定脚本相对路径，按序执行，全部退出码 0 记 pass */
  checks: string[];
  /** 覆盖全局 --base */
  baseCommit?: string;
  /** 覆盖全局超时（毫秒） */
  timeoutMs?: number;
  /** 分类标签 */
  tags?: string[];
}

/** 加载后的任务 */
export interface Task {
  /** 任务目录绝对路径 */
  dir: string;
  meta: TaskMeta;
  /** prompt.md 内容（已 trim） */
  prompt: string;
}

/** 单次 trial 结果 */
export interface TrialResult {
  taskId: string;
  arm: Arm;
  repeat: number;
  /** true=通过; false=未通过; null=基础设施失败（不计入成功率） */
  passed: boolean | null;
  durationMs: number;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  /** 基础设施失败原因 */
  error?: string;
  worktree?: string;
  transcriptPath?: string;
  /** Hash of the selected instruction at the checked-out base, before ablation. */
  contextSha256?: string;
}

/** 一次完整实验记录 */
export interface RunRecord {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  /** 实验是否完整（false = 被成本闸门等中止） */
  complete: boolean;
  adapter: string;
  model?: string;
  /** 受测指令文件（相对仓库路径） */
  contextFile: string;
  repoRoot: string;
  baseCommit: string;
  gitSha?: string;
  trials: TrialResult[];
  /** Optional reproducibility metadata; requested model is not provider-attested model identity. */
  manifest?: {
    nodeVersion:string;
    platform:NodeJS.Platform;
    configuration:CtxEvalConfig;
    taskPrompts:{taskId:string;sha256:string}[];
    isolation:string;
  };
}

/** 配置（CLI > ctx-eval.json > 默认值） */
export interface CtxEvalConfig {
  repeats: number;
  arms: Arm[];
  adapter: string;
  model?: string;
  contextFile: string;
  timeoutMs: number;
  /** 成本闸门（美元），undefined = 不限制 */
  maxCostUsd?: number;
  /** 运行数据目录（相对仓库根） */
  workdir: string;
  /** TOST 等价边界（百分点） */
  marginPp: number;
}

/** 配对样本：同一 (task, repeat) 下两臂的通过情况 */
export interface PairedSample {
  taskId: string;
  repeat: number;
  baseline: boolean;
  arm: boolean;
}

/** 单臂统计 */
export interface ArmStats {
  arm: Arm;
  /** 有效 trial 数（passed 非 null） */
  n: number;
  passed: number;
  passRate: number;
  meanCostUsd?: number;
  meanDurationMs?: number;
}

/** TOST 等价检验结果 */
export interface TostResult {
  /** 等价边界（百分点） */
  marginPp: number;
  /** 95% CI 是否完全落入 ±margin */
  equivalent: boolean;
  /** bootstrap CI（百分点） */
  ci95: [number, number];
  iterations: number;
  /** bootstrap 分布落入 −margin / +margin 之外的比例（单侧 p 的近似） */
  pLower?: number;
  pUpper?: number;
}

/** 两臂对比报告 */
export interface ComparisonReport {
  runId: string;
  arm: Arm;
  baseline: Arm;
  /** 参与对比的任务数 */
  pairs: number;
  /** 配对差（百分点，arm − baseline） */
  passRateDiffPp: number;
  tost: TostResult;
  arms: ArmStats[];
  costDeltaUsd?: number;
  /** 成本变化百分比（arm 相对 baseline） */
  costDeltaPct?: number;
}
