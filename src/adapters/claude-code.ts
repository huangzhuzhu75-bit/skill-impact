import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterRunInput, AdapterRunOutput, AgentAdapter } from "./types.ts";
import { hasBinary, runProcess } from "./util.ts";

/**
 * Claude Code 适配器。
 *
 * 调用 `claude -p "<prompt>" --output-format json`（print 模式，非交互）。
 * 注意：无人值守运行需要用户已配置好权限策略（如
 * `--dangerously-skip-permissions` 或在受信沙箱中运行），ctx-eval 默认
 * 不追加该参数，把权限决定权留给用户。
 *
 * 参考: https://github.com/anthropics/claude-code
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  name = "claude-code";

  async available(): Promise<boolean> {
    return hasBinary("claude");
  }

  installHint(): string {
    return "安装 Claude Code: npm install -g @anthropic-ai/claude-code（或参考 https://github.com/anthropics/claude-code）";
  }

  async run(input: AdapterRunInput): Promise<AdapterRunOutput> {
    const started = Date.now();
    const args = ["-p", input.prompt, "--output-format", "json"];
    if (input.model) args.push("--model", input.model);

    const proc = runProcess("claude", args, {
      cwd: input.worktree,
      timeoutMs: input.timeoutMs,
    });

    const output: AdapterRunOutput = {
      durationMs: Date.now() - started,
      exitCode: proc.exitCode,
    };

    if (proc.timedOut) {
      output.error = `claude 运行超时（>${input.timeoutMs}ms）`;
      return output;
    }

    const rawDir = input.transcriptDir ?? join(input.worktree, "..", ".ctx-eval-raw");
    try {
      mkdirSync(rawDir, { recursive: true });
      const transcriptPath = join(rawDir, `claude-${input.arm}-${Date.now()}.json`);
      writeFileSync(transcriptPath, proc.stdout);
      output.transcriptPath = transcriptPath;
    } catch {
      // 落盘失败不影响实验
    }

    const parsed = parseClaudeResult(proc.stdout);
    output.tokensIn = parsed.tokensIn;
    output.tokensOut = parsed.tokensOut;
    output.costUsd = parsed.costUsd;
    output.completed = parsed.isError === false && proc.exitCode === 0;
    if (proc.exitCode !== 0 && !output.error) {
      output.error = `claude 退出码 ${proc.exitCode}: ${tail(proc.stderr, 500)}`;
    }
    return output;
  }
}

/** 解析 claude --output-format json 的结果对象。 */
export function parseClaudeResult(stdout: string): {
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  isError?: boolean;
} {
  const text = stdout.trim();
  if (!text.startsWith("{")) return {};
  try {
    const result = JSON.parse(text) as {
      is_error?: boolean;
      total_cost_usd?: number;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      tokensIn: result.usage?.input_tokens,
      tokensOut: result.usage?.output_tokens,
      costUsd: result.total_cost_usd,
      isError: result.is_error,
    };
  } catch {
    return {};
  }
}

function tail(s: string, n: number): string {
  return s.length > n ? s.slice(-n) : s;
}
