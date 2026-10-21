/** Agent 适配器契约：只负责"在给定 worktree 里把任务跑完并报告消耗"，不理解臂语义。 */
export interface AdapterRunInput {
  /** Agent 的工作目录（已物化好对应臂的 worktree） */
  worktree: string;
  /** 任务 prompt */
  prompt: string;
  /** 当前实验臂（仅供适配器记录，不改变行为） */
  arm: "none" | "always-on" | "selective";
  timeoutMs: number;
  model?: string;
  /** Persist transcripts outside disposable trial worktrees. */
  transcriptDir?: string;
}

export interface AdapterRunOutput {
  /** Agent 是否自行声明完成（判定以 checks 为准，这里仅记录） */
  completed?: boolean;
  durationMs: number;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  /** 原始输出落盘路径（.ctx-eval/raw/） */
  transcriptPath?: string;
  /** 进程退出码 */
  exitCode: number | null;
  /** 解析失败等原因 */
  error?: string;
}

export interface AgentAdapter {
  name: string;
  /** 探测本机是否可用（二进制在 PATH 中） */
  available(): Promise<boolean>;
  /** 缺失时的安装指引 */
  installHint(): string;
  run(input: AdapterRunInput): Promise<AdapterRunOutput>;
}
