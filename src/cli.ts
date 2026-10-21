#!/usr/bin/env node
/**
 * ctx-eval CLI —— 命令路由与参数解析（零依赖）。
 *
 * 命令: init | run | report | gate | adapters
 * 运行要求: Node.js >= 22.18（原生 TypeScript 执行，无构建步骤）
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadConfig, mergeOverrides } from "./core/config.ts";
import { loadTasks } from "./core/task.ts";
import { runExperiment, ensureWorkdir } from "./core/runner.ts";
import { compareArms } from "./core/stats.ts";
import { renderMarkdown, renderTerminal } from "./core/report.ts";
import { appendRecord, readRecords } from "./storage/jsonl.ts";
import { CodexAdapter } from "./adapters/codex.ts";
import { ClaudeCodeAdapter } from "./adapters/claude-code.ts";
import { runDemo } from './core/demo.ts';
import { renderHtml } from './core/dashboard.ts';
import { auditFile } from './core/audit.ts';
import { hasBinary } from './adapters/util.ts';
import type { AgentAdapter } from "./adapters/types.ts";
import type { Arm, CtxEvalConfig, RunRecord } from "./core/types.ts";

const USAGE = `ctx-eval — does your AGENTS.md earn its tokens?

Usage:
  ctx-eval init [name]             Scaffold an example task under ./ctx-eval-tasks/<name>
  ctx-eval run [options]           Run the ablation experiment
  ctx-eval report <runId|latest>   Re-render a stored run as Markdown
  ctx-eval gate [options]          CI gate: fail when behavior regresses
  ctx-eval adapters                List adapters and local availability
  ctx-eval doctor                  Check local prerequisites without an API call
  ctx-eval audit <file>            Inspect an instruction file locally
  ctx-eval demo --out <new-dir>    Free scripted experiment + visual report

report options:
  --repo <path> --format html|markdown --out <file>

run options:
  --tasks <dir>        Task directory (default ./ctx-eval-tasks)
  --repo <path>        Repository under test (git repo; default .)
  --base <commit>      Baseline commit (default HEAD)
  --adapter <name>     codex | claude-code (default codex)
  --model <id>         Model id passed to the agent (optional)
  --arms <a,b>         none,always-on,selective (default none,always-on)
  --repeats <n>        Repeats per arm (default 3)
  --context <path>     Instruction file under test (default AGENTS.md)
  --max-cost <usd>     Abort when cumulative cost reaches this
  --timeout <ms>       Per-run agent timeout (default 900000)

gate options:
  --baseline <runId>   Baseline run (required)
  --current <runId>    Current run (required)
  --margin <pp>        Equivalence margin in percentage points (default 10)
`;

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

function str(flags: Record<string, string | boolean>, key: string, dflt?: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : dflt;
}

function num(flags: Record<string, string | boolean>, key: string, dflt?: number): number | undefined {
  const v = str(flags, key);
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} 需要数字，得到: ${v}`);
  return n;
}

function getAdapter(name: string): AgentAdapter {
  switch (name) {
    case "codex":
      return new CodexAdapter();
    case "claude-code":
      return new ClaudeCodeAdapter();
    default:
      throw new Error(`未知适配器: ${name}（可选: codex, claude-code）`);
  }
}

async function cmdInit(args: string[]): Promise<number> {
  const name = args.find((a) => !a.startsWith("--")) ?? "example-task";
  const dir = resolve(process.cwd(), "ctx-eval-tasks", name);
  if (existsSync(dir)) {
    console.error(`已存在: ${dir}`);
    return 1;
  }
  mkdirSync(join(dir, "checks"), { recursive: true });
  writeFileSync(
    join(dir, "task.json"),
    `${JSON.stringify(
      {
        id: name,
        title: "Example task: create hello.txt",
        checks: ["checks/check.mjs"],
        tags: ["example"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, "prompt.md"),
    `Create a file named hello.txt in the repository root containing exactly the text "hello from agent" (lowercase, no trailing newline). Do not modify any other file.\n`,
  );
  writeFileSync(
    join(dir, "checks", "check.sh"),
    `import {existsSync, readFileSync} from 'node:fs';
process.exit(existsSync('hello.txt') && readFileSync('hello.txt','utf8') === 'hello from agent' ? 0 : 1);
`,
  );
  console.log(`示例任务已创建: ${dir}`);
  console.log(`运行: ctx-eval run --repo . --tasks ${join(process.cwd(), "ctx-eval-tasks")}`);
  return 0;
}

async function cmdRun(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  const repoRoot = resolve(process.cwd(), str(flags, "repo", ".")!);
  const tasksDir = resolve(process.cwd(), str(flags, "tasks", "./ctx-eval-tasks")!);
  const baseCommit = str(flags, "base", "HEAD")!;
  const configPath = existsSync(join(repoRoot, "ctx-eval.json")) ? join(repoRoot, "ctx-eval.json") : undefined;

  const base = loadConfig(repoRoot);
  const overrides: Partial<CtxEvalConfig> = {};
  const adapterName = str(flags, "adapter", base.adapter)!;
  const armsRaw = str(flags, "arms");
  const repeats = num(flags, "repeats", base.repeats)!;
  const maxCost = num(flags, "max-cost", base.maxCostUsd);
  const timeout = num(flags, "timeout", base.timeoutMs)!;
  const model = str(flags, "model", base.model);
  const contextFile = str(flags, "context", base.contextFile)!;
  overrides.adapter = adapterName;
  overrides.repeats = repeats;
  overrides.maxCostUsd = maxCost;
  overrides.timeoutMs = timeout;
  overrides.model = model;
  overrides.contextFile = contextFile;
  if (armsRaw) overrides.arms = armsRaw.split(",").map((s) => s.trim()) as Arm[];
  const config = mergeOverrides(base, overrides);

  const adapter = getAdapter(config.adapter);
  if (!(await adapter.available())) {
    console.error(`适配器 ${config.adapter} 不可用。${adapter.installHint()}`);
    return 2;
  }

  const tasks = loadTasks(tasksDir);
  ensureWorkdir(repoRoot, config.workdir);
  console.log(
    `ctx-eval: ${tasks.length} task(s) × ${config.arms.length} arm(s) × ${config.repeats} repeat(s) via ${config.adapter}`,
  );
  if (configPath) console.log(`config: ${configPath}`);

  const record = await runExperiment({
    repoRoot,
    baseCommit,
    tasks,
    config,
    adapter,
    onTrial: (t) => {
      const mark = t.passed === null ? "ERR" : t.passed ? "PASS" : "FAIL";
      console.log(
        `  [${mark}] ${t.taskId} / ${t.arm} / #${t.repeat}${t.costUsd !== undefined ? `  $${t.costUsd.toFixed(3)}` : ""}${t.error ? `  (${t.error})` : ""}`,
      );
    },
  });

  const runsDir = join(repoRoot, config.workdir, "runs");
  const recordPath = join(runsDir, `${record.runId}.json`);
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(repoRoot, config.workdir, "latest.json"), JSON.stringify({ runId: record.runId }, null, 2));
  const htmlPath = join(runsDir, `${record.runId}.html`);
  writeFileSync(htmlPath, renderHtml(record, config.marginPp));
  console.log(`Visual report: ${htmlPath}`);
  console.log(`\nrun 记录: ${recordPath}`);

  if (config.arms.length < 2) {
    console.log("只有一个臂，跳过对比报告。");
    return 0;
  }
  const arm = config.arms[config.arms.length - 1];
  const baseline = config.arms[0];
  const comparison = compareArms(record, arm, baseline, config.marginPp);
  console.log("");
  console.log(renderTerminal(comparison));
  console.log(`\n完整报告: ctx-eval report ${record.runId}`);
  return record.complete && record.trials.some(t => t.passed !== null) ? 0 : 2;
}

function loadRun(repoRoot: string, idOrLatest: string, workdir: string): RunRecord {
  const runsDir = join(repoRoot, workdir, "runs");
  let id = idOrLatest;
  if (id === "latest") {
    const pointer = join(repoRoot, workdir, "latest.json");
    if (!existsSync(pointer)) throw new Error("没有 latest.json——先跑一次 ctx-eval run");
    id = (JSON.parse(readFileSync(pointer, "utf8")) as { runId: string }).runId;
  }
  const file = join(runsDir, `${id}.json`);
  if (!existsSync(file)) {
    const available = existsSync(runsDir) ? readdirSync(runsDir).join(", ") : "(空)";
    throw new Error(`找不到 run: ${id}。可用: ${available}`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as RunRecord;
}

function cmdReport(args: string[]): number {
  const id = args.find((a) => !a.startsWith("--")) ?? "latest";
  const flags = parseFlags(args);
  const workdir = str(flags, "workdir", ".ctx-eval")!;
  const repoRoot = resolve(str(flags, 'repo', process.cwd())!);
  const record = loadRun(repoRoot, id, workdir);
  const margin = num(flags, "margin", 10)!;
  const arms = [...new Set(record.trials.map((t) => t.arm))];
  if (arms.length < 2) {
    console.log(JSON.stringify(record, null, 2));
    return 0;
  }
  const comparison = compareArms(record, arms[arms.length - 1], arms[0], margin);
  const output = str(flags,'format') === 'html' ? renderHtml(record,margin) : renderMarkdown(record, comparison);
  const outPath = str(flags,'out');
  if (outPath) { writeFileSync(resolve(outPath),output); console.log(resolve(outPath)); }
  else console.log(output);
  return 0;
}

function cmdGate(args: string[]): number {
  const flags = parseFlags(args);
  const workdir = str(flags, "workdir", ".ctx-eval")!;
  const margin = num(flags, "margin", 10)!;
  const baselineId = str(flags, "baseline");
  const currentId = str(flags, "current");
  if (!baselineId || !currentId) {
    console.error("gate 需要 --baseline <runId> 与 --current <runId>");
    return 2;
  }
  const repoRoot = resolve(process.cwd());
  const baseline = loadRun(repoRoot, baselineId, workdir);
  const current = loadRun(repoRoot, currentId, workdir);

  const arm = str(flags,'arm','always-on') as Arm;
  if (!baseline.complete || !current.complete || baseline.adapter !== current.adapter || baseline.model !== current.model) throw new Error('Gate requires complete runs with matching adapter and model.');
  const combined: RunRecord = {...current, trials:[
    ...baseline.trials.filter(t=>t.arm===arm).map(t=>({...t,arm:'none' as Arm})),
    ...current.trials.filter(t=>t.arm===arm).map(t=>({...t,arm:'always-on' as Arm}))
  ]};
  const comparison = compareArms(combined, 'always-on', 'none', margin);
  if (comparison.pairs < 2) throw new Error('Gate has insufficient paired observations.');
  console.log(renderTerminal(comparison));
  const regressed = comparison.tost.ci95[0] < -margin;
  if (regressed) {
    console.error(`\nGATE FAILED: ${comparison.arm} regressed beyond -${margin}pp vs baseline ${baseline.runId}`);
    return 1;
  }
  console.log(`\nGATE PASSED: no regression beyond -${margin}pp vs baseline ${baseline.runId}`);
  return 0;
}

async function cmdAdapters(): Promise<number> {
  const adapters: AgentAdapter[] = [new CodexAdapter(), new ClaudeCodeAdapter()];
  for (const a of adapters) {
    const ok = await a.available();
    console.log(`${a.name.padEnd(14)} ${ok ? "available" : "not found"}${ok ? "" : ` — ${a.installHint()}`}`);
  }
  return 0;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(USAGE);
    return cmd ? 0 : 1;
  }
  try {
    switch (cmd) {
      case "init":
        return await cmdInit(rest);
      case "run":
        return await cmdRun(rest);
      case "report":
        return cmdReport(rest);
      case "gate":
        return cmdGate(rest);
      case "adapters":
        return await cmdAdapters();
      case 'demo': {
        const flags = parseFlags(rest);
        const path = await runDemo(str(flags,'out',`./outputs/demo-${Date.now()}`)!);
        console.log(`\nSCRIPTED DEMO ONLY — no model/API calls.\nOpen report: ${path}`);
        return 0;
      }
      case 'audit':
        console.log(auditFile(rest[0] ?? 'AGENTS.md'));
        return 0;
      case 'doctor': {
        console.log(`Node ${process.version} / ${process.platform}`);
        for (const name of ['git','bash','codex','claude']) console.log(`${name.padEnd(10)} ${hasBinary(name) ? 'found' : 'not on PATH (or no override)'}`);
        console.log('Node .mjs checks need no Bash. Shell checks require Bash.\nSet CTX_EVAL_CODEX_BIN / CTX_EVAL_CLAUDE_BIN / CTX_EVAL_BASH_BIN to explicit executables.\nAvailability does not verify login, API access or billing.');
        return hasBinary('git') ? 0 : 2;
      }
      default:
        console.error(`未知命令: ${cmd}\n\n${USAGE}`);
        return 1;
    }
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    return 2;
  }
}

main().then((code) => process.exit(code));
