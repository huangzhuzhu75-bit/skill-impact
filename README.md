# Skill Impact

**Turn agent benchmarks into evidence you can ship.**

[简体中文](README.zh-CN.md)

[![CI](https://github.com/huangzhuzhu75-bit/skill-impact/actions/workflows/ci.yml/badge.svg)](https://github.com/huangzhuzhu75-bit/skill-impact/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.18-green.svg)](package.json)

Local-first reports and regression checks for Skill authors, agent engineers, and researchers. Import existing experiment results, inspect quality/time/cost tradeoffs, and export a figure, a PR summary, or a paper-ready table—without running a model again.

**Early alpha.** The included demo is synthetic. It proves compatibility and reporting behavior, not that any model or Skill became better. Live-agent experiments and external adoption have not yet been validated.

![Synthetic report example](docs/assets/demo-card.svg)

## Why use this?

You have benchmark results, but still need to explain what changed and whether you can trust the comparison. Skill Impact provides:

- **Multiple dimensions together:** quality, end-to-end completion time, tokens, reported cost, tool calls, and first-token latency when actually recorded.
- **Evidence coverage:** see which metrics have complete pairs and which are missing. Unknown never becomes zero.
- **Honest comparisons:** regressions stay visible. A positive point estimate is not automatically a significant gain.
- **Portable delivery:** self-contained HTML, SVG, CSV, LaTeX, evidence JSON, and PR-ready Markdown.
- **Configurable regression policy:** separate task quality from speed or cost savings; return useful exit codes for CI.

This is a reporting companion to existing evaluators, not a new skill marketplace or a replacement for their runners. [Comparison with related tools](docs/related-tools.md).

## Try it in 30 seconds

Requires **Node.js 22.18+** and Git. No package installation, API key, account, or model call is needed for the offline demo.

```sh
git clone https://github.com/huangzhuzhu75-bit/skill-impact.git
cd skill-impact
node bin/skill-impact.mjs demo --out outputs/demo
```

Open `outputs/demo/report.html` in your browser. The demo includes improvements, unchanged cases, and a regression. Its synthetic quality interval crosses zero, so the report correctly calls the overall difference inconclusive.

The destination must be a new directory; previous evidence is never silently overwritten.

## Import your own results

For an Anthropic skill-creator-compatible iteration directory:

```sh
node bin/skill-impact.mjs report \
  --input ./my-iteration/benchmark.json \
  --workspace ./my-iteration \
  --out ./outputs/my-report
```

`--workspace` is optional. It reads per-run `timing.json` files when present. Without trustworthy token provenance, ambiguous aggregate token fields are withheld: some upstream aggregators fall back to output character counts.

For a ctx-eval `RunRecord`, omit `--workspace`:

```sh
node bin/skill-impact.mjs report --input ./run.json --out ./outputs/my-report
```

Defaults are `without_skill` → `with_skill` for benchmark artifacts, and `none` → `always-on` for ctx-eval records. Select a different pair explicitly:

```sh
node bin/skill-impact.mjs report \
  --input ./benchmark.json \
  --baseline codex_without_skill \
  --candidate codex_with_skill \
  --out ./outputs/codex-report
```

Do not merge different agents, models, task suites, or grading rules into a claim about a Skill. The importer does not authenticate the source experiment or automatically detect every confounder.

### Supported inputs

| Input | Current support |
|---|---|
| Anthropic skill-creator-compatible `benchmark.json` | Per-run `runs[]`; optional raw timing workspace |
| ctx-eval `RunRecord` | Per-trial `trials[]` |
| agent-skill-eval or other frameworks | Only artifacts matching the documented schema; version-wide support is not claimed |
| Summary-only results, arbitrary plugin output, Promptfoo exports | Not yet supported |

See [input formats](docs/input-formats.md) and [methodology](docs/methodology.md).

### Generated files

| File | Use |
|---|---|
| `report.html` | Offline review with task-level evidence and integrity notes |
| `summary.svg` | A shareable comparison figure |
| `metrics.csv` | Further analysis in a spreadsheet or script |
| `table.tex` | A LaTeX table fragment |
| `evidence.json` | Normalized observations, per-metric coverage, source hashes, and statistics |

Review metadata and artifacts before sharing them publicly. Report generation performs no network requests.

## Use as an Agent Skill

The standalone folder is [`skills/skill-impact`](skills/skill-impact/SKILL.md). Ask a compatible agent to read its `SKILL.md`, or copy the folder to that agent's documented Skills location.

Example request:

> Use Skill Impact to compare the results in my iteration folder. Show quality, completion time, token/cost tradeoffs, and missing evidence. Export a report and a PR summary. Do not rerun the model.

You may also use the existing Vercel Skills CLI:

```sh
npx skills add huangzhuzhu75-bit/skill-impact --skill skill-impact
```

That optional command downloads a separate tool and the Skill; it is not required by the offline workflow. Skill Impact is independent of Vercel and Anthropic. `find-skills` can discover candidates; it does not measure their effectiveness.

## Check regressions in CI

```sh
node bin/skill-impact.mjs gate \
  --evidence outputs/my-report/evidence.json \
  --markdown outputs/my-report/pr-summary.md \
  --json outputs/my-report/gate.json
```

Default policy allows at most a **2 percentage point quality drop** and **20% increases** in recorded completion time, tokens, or cost. Quality and duration require complete paired coverage. Unknown optional metrics are reported without a policy decision.

| Exit | Meaning |
|---|---|
| `0` | Within configured policy |
| `1` | Observed regression beyond policy |
| `2` | Invalid configuration or insufficient required evidence |

These are configurable engineering thresholds, not significance tests or grant requirements. Synthetic data is rejected unless `--allow-synthetic` is explicitly used for a demo/test. [Gate reference](docs/regression-policy.md).

The repository CI runs offline tests and a synthetic compatibility example across Linux/Windows and Node 22.22/24. It does not use model credentials or run paid experiments. A job summary is generated; the tool does not post PR comments automatically.

## Measurement limits

- Completion time is not time to first token. Missing first-token timestamps remain unknown.
- Assertion pass rate and whole-task success are different quantities; the report labels the source metric.
- Imported reports do not prove isolation, activation, model identity, or causal improvement.
- Bootstrap intervals are exploratory, resampled by task, and may be misleading on tiny or degenerate samples. No equivalence claim is made by the primary reporter.
- Source hashes identify files; they do not certify authenticity or statistical validity.
- The optional legacy coding-agent runner uses Git worktrees, not a container security boundary. Do not run untrusted tasks on a production machine.

## Development

```sh
node --test "tests/**/*.test.ts"
node bin/skill-impact.mjs doctor
```

Runtime dependencies: **none**. The legacy Python instruction audit is optional. Experimental `ctx-eval` and `prompt-lab` components remain available; see [experimental tools](docs/experimental-tools.md).

Start contributing with a minimal importer fixture, a metric-correctness fix, or a reproducible bug. See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and the [roadmap](docs/roadmap.md).

## License and attribution

[MIT](LICENSE). This project reads evaluation artifacts from other tools; their implementation is not vendored. Pinned upstream references and scoped licenses are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No affiliation, endorsement, or funding is implied.
