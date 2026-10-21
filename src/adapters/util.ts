import { spawnSync } from "node:child_process";
import { existsSync } from 'node:fs';

export function binary(name: string): string {
  const configured = process.env[`CTX_EVAL_${name.toUpperCase().replace(/-/g, '_')}_BIN`];
  return configured || name;
}

/** 探测二进制是否在 PATH 中。 */
export function hasBinary(name: string): boolean {
  const resolved = binary(name);
  if (resolved !== name) return existsSync(resolved);
  const probe = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(probe, [resolved], { stdio: "ignore", windowsHide: true });
  return r.status === 0;
}

export interface SpawnResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * 以超时运行子进程并收集输出。
 * Windows 下通过 bash 执行脚本（Git Bash 环境），其他平台直接 bash。
 */
export function runProcess(
  command: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; maxBuffer?: number },
): SpawnResult {
  const r = spawnSync(binary(command), args, {
    cwd: opts.cwd,
    timeout: opts.timeoutMs,
    maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    exitCode: r.status,
    signal: r.signal,
    stdout: r.stdout ?? "",
    stderr: r.error ? `${r.error.message}\n${r.stderr ?? ''}` : r.stderr ?? "",
    timedOut: r.error?.name === "TimeoutError" || (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
  };
}

/** bash 命令名（跨平台：Git Bash / WSL / 原生 bash）。 */
export function bashCommand(): string {
  return binary('bash');
}
