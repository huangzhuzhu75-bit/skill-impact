import type { ComparisonReport, RunRecord } from "./types.ts";
import { isRegression } from "./stats.ts";

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function pp(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}pp`;
}

/** 渲染可贴进 GitHub Issue 的 Markdown 报告。 */
export function renderMarkdown(record: RunRecord, c: ComparisonReport): string {
  const lines: string[] = [];
  lines.push(`# ctx-eval report — ${record.runId}`);
  lines.push("");
  lines.push(`- adapter: \`${record.adapter}\`${record.model ? ` (model: \`${record.model}\`)` : ""}`);
  lines.push(`- context file: \`${record.contextFile}\``);
  lines.push(`- base commit: \`${record.baseCommit.slice(0, 12)}\``);
  lines.push(`- complete: ${record.complete ? "yes" : "NO (cost limit or abort)"}`);
  lines.push("");

  lines.push("## Arm comparison (paired by task × repeat)");
  lines.push("");
  lines.push("| arm | passed | pass rate | avg cost | avg duration |");
  lines.push("|---|---|---|---|---|");
  for (const s of c.arms) {
    lines.push(
      `| ${s.arm} | ${s.passed}/${s.n} | ${pct(s.passRate)} | ${s.meanCostUsd !== undefined ? `$${s.meanCostUsd.toFixed(3)}` : "—"} | ${s.meanDurationMs !== undefined ? `${(s.meanDurationMs / 1000).toFixed(1)}s` : "—"} |`,
    );
  }
  lines.push("");

  lines.push("## Paired difference");
  lines.push("");
  lines.push(
    `- pairs used: **${c.pairs}**`,
  );
  lines.push(
    `- **${c.arm} − ${c.baseline}: ${pp(c.passRateDiffPp)}**, 95% CI [${pp(c.tost.ci95[0])}, ${pp(c.tost.ci95[1])}] (${c.tost.iterations.toLocaleString()} cluster-bootstrap resamples)`,
  );
  lines.push(
    `- TOST equivalence (±${c.tost.marginPp}pp): **${c.tost.equivalent ? "equivalent — no measurable benefit" : "NOT equivalent"}**`,
  );
  lines.push("");

  lines.push("## Cost");
  lines.push("");
  if (c.costDeltaUsd !== undefined) {
    lines.push(
      `- ${c.arm} costs ${c.costDeltaPct !== undefined ? `**${c.costDeltaPct >= 0 ? "+" : ""}${c.costDeltaPct.toFixed(1)}%**` : ""} (${c.costDeltaUsd >= 0 ? "+" : ""}$${c.costDeltaUsd.toFixed(3)}/run) vs ${c.baseline}.`,
    );
  } else {
    lines.push("- 成本数据不可用（适配器未报告用量）。");
  }
  lines.push("");

  lines.push("## Verdict");
  lines.push("");
  lines.push(...verdictLines(c));
  lines.push("");
  lines.push("---");
  lines.push(
    "*Generated locally by ctx-eval. Observed-task bootstrap intervals are not a guarantee of general effectiveness; repeated identical outcomes may produce degenerate intervals.*",
  );
  return lines.join("\n");
}

/** 终端摘要（短版本）。 */
export function renderTerminal(c: ComparisonReport): string {
  const lines: string[] = [];
  for (const s of c.arms) {
    lines.push(
      `  ${s.arm.padEnd(10)} ${s.passed}/${s.n} (${pct(s.passRate)})${s.meanCostUsd !== undefined ? `  $${s.meanCostUsd.toFixed(3)}/run` : ""}`,
    );
  }
  lines.push(
    `  paired diff (${c.arm} − ${c.baseline}): ${pp(c.passRateDiffPp)}  95% CI [${pp(c.tost.ci95[0])}, ${pp(c.tost.ci95[1])}]`,
  );
  lines.push(
    `  TOST (±${c.tost.marginPp}pp): ${c.tost.equivalent ? "equivalent — no measurable benefit" : "not equivalent"}`,
  );
  lines.push(...verdictLines(c).map((l) => `  ${l}`));
  return lines.join("\n");
}

/** 基于研究结论的行动建议。 */
function verdictLines(c: ComparisonReport): string[] {
  const out: string[] = [];
  if (c.pairs < 2) {
    out.push("没有可用配对样本——增加 repeats 或检查实验是否完整运行。");
    return out;
  }
  if (c.tost.equivalent) {
    out.push(
      `**Verdict: no measurable benefit within the configured margin on the observed tasks. Cost must be assessed separately.**`,
    );
    if (c.costDeltaPct !== undefined && c.costDeltaPct > 0) {
      out.push(
        `Cost is up ${c.costDeltaPct.toFixed(1)}% with no measurable gain on the observed tasks. Test a smaller candidate on held-out tasks before removing rules.`,
      );
    }
  } else if (c.tost.ci95[1] < 0) {
    out.push(
      `**Verdict: REGRESSION** — ${c.arm} has a negative paired interval versus ${c.baseline}. Do not ship this instruction-file change.`,
    );
  } else if (c.tost.ci95[0] > 0) {
    out.push(
      `**Verdict: improvement of ${pp(c.passRateDiffPp)}** (CI excludes both 0 and −${c.tost.marginPp}pp). Keep the file — but re-check the cost column.`,
    );
  } else {
    out.push(
      `**Verdict: inconclusive (${pp(c.passRateDiffPp)})**. The interval crosses zero. Collect more independent tasks.`,
    );
  }
  return out;
}
