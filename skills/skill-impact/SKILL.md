---
name: skill-impact
description: Turn existing agent or Skill benchmark results into auditable multidimensional reports for engineering delivery and research. Use for baseline/candidate performance comparisons, completion time and quality tradeoffs, reproducible figures, or benchmark evidence review. Agent与Skills性能对比、工程交付及研究报告。
license: MIT
---

# Skill Impact

Produce a decision report from existing measurements, retaining regressions and missing evidence. Intended for Skill authors, agent engineers and researchers, not a general tool recommender.

## Inputs and workflow

Locate the supplied benchmark artifact. Supported now: Anthropic skill-creator-compatible `benchmark.json` with per-run `runs[]`, and ctx-eval `RunRecord` with `trials[]`. Ask for missing artifact location and intended baseline/candidate together; do not silently substitute a hand-authored demonstration for a real evaluation.

Run the bundled local reporter (Node >=22.18, no dependencies):

```sh
node <skill-dir>/scripts/report.mjs --input <benchmark.json> --out <new-report-dir>
```

For an Anthropic workspace, add `--workspace <iteration-dir>` to read exact per-run `timing.json` files. Default configurations are `without_skill` / `with_skill`. For grouped agent-skill-eval-style names, explicitly pass `--baseline <agent>_without_skill --candidate <agent>_with_skill`; only a matching schema is supported, not every version of that framework. Never merge model/agent groups into one improvement claim.

Reports contain HTML, SVG, CSV, evidence JSON and a LaTeX table. Inspect missing coverage and integrity notes before summarizing. Report quality and time tradeoffs together; do not present a faster but incorrect system as an improvement. The table's assertion pass rate differs from all-checks task success.

For an existing maintainer policy, run `node <skill-dir>/scripts/gate.mjs --evidence <report-dir>/evidence.json --markdown <report-dir>/pr-summary.md --json <report-dir>/gate.json`. Exit 0 means within configured policy, 1 means regression, 2 means missing evidence or invalid configuration. Defaults allow at most 2 percentage points quality loss and 20% increases in recorded completion time, tokens or cost. These are configurable product defaults, not OpenAI grant criteria or statistical significance thresholds. Synthetic input is refused unless explicitly allowed for a demonstration.

## Relationship to find-skills and evaluation runners

When the user needs a candidate skill, use an available `find-skills` Skill or existing Skills CLI to discover candidates. Search is optional and online; report generation is offline. Record repository, commit, skill path and license before testing. Popularity is not measured effectiveness. No official Vercel affiliation is implied.

When no results exist, prepare an experiment for the user's existing runner (such as skill-creator or agent-skill-eval). Fix tasks, grading, model, permissions and repetition policy first. Execute only within existing model/data-sharing authorization. Do not install another runner, change global settings or invoke paid experiments solely because this reporting Skill was called.

## Measurement discipline

- End-to-end completion time is not time to first token. Show first-token latency only if independently recorded by the source.
- Do not infer tokens from character count. Some aggregate sources fall back to characters; raw timing files or documented provider telemetry are needed.
- Unknown cost, tool calls, errors or activation evidence stays unknown. A declared skill in a directory does not prove it was read or used.
- Pair the same task/repeat within one comparable agent/model group. Separate infrastructure failures, missing runs and skipped assertions.
- An interval across zero is inconclusive. With few independent tasks, describe observations without claiming general significance. Same-session outputs, cached runs and mock providers must be disclosed.
- Source hashes identify inputs; they do not authenticate who produced them. Inspect metadata for private information before sharing. Publishing and uploads require their own authorization.

Deliver the local report and figure, observed wins/regressions, missing dimensions and the strongest remaining experimental limitation. Respond in the user's language. Never promise performance improvements or GitHub stars.
