# Input formats

The primary importer is `skills/skill-impact/scripts/report.mjs`. It accepts per-run observations, not summary-only statistics. Both configuration names must exist, and duplicate `(configuration, task, repeat)` records are rejected.

## Anthropic-compatible benchmark

```json
{
  "metadata": {"executor_model": "record-the-exact-model"},
  "runs": [
    {"eval_id": 1, "configuration": "without_skill", "run_number": 1,
     "result": {"pass_rate": 0.5, "time_seconds": 12.0}},
    {"eval_id": 1, "configuration": "with_skill", "run_number": 1,
     "result": {"pass_rate": 1.0, "time_seconds": 14.0}}
  ]
}
```

`pass_rate` is a number in `[0,1]` and is labeled **mean assertion pass rate**. `time_seconds` is end-to-end duration. The importer also reads nonnegative `cost_usd`, `tool_calls`, and `ttft_ms` from the per-run `result` when present. Do not fabricate unsupported fields to fill a chart.

Repeat numbers must be positive integers. Task identifiers are compared as strings. Grouped names such as `codex_with_skill` require an explicit `--baseline` / `--candidate`; the tool does not implicitly combine model groups.

### Raw timing workspace

With `--workspace ITERATION`, the importer checks:

```text
ITERATION/
  eval-1/
    with_skill/run-1/timing.json
    without_skill/run-1/timing.json
```

Each timing file may contain:

```json
{"total_tokens": 2400, "total_duration_seconds": 14.0}
```

Original timing-file hashes are retained. No timing file is required; missing/ambiguous counters remain unknown. An aggregate `tokens` field is accepted only when `metadata.tokens_provenance` explicitly equals `provider-reported`. This is operator-declared provenance, not authentication.

Summary duration zero is treated as unknown because upstream aggregation can substitute zero for absent timing. Explicit raw timing values can distinguish an actual recorded zero.

Compatibility was checked against the original Anthropic skill-creator aggregation script at commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44`, using synthetic grading/timing fixtures. This does not certify all historical/future versions or every framework with similar field names.

## ctx-eval RunRecord

The experimental runner in this repository writes `trials[]`. Each record has `taskId`, `arm`, `repeat`, `passed`, and `durationMs`, with optional token/cost fields. `passed: true/false` maps to whole-task success; `null` is an infrastructure failure and does not become a failed task.

Defaults compare `none` against `always-on`. Input/output token counts must both be available to report their sum. Milliseconds are converted to seconds. Incomplete source experiments are flagged.

## Evidence output

`evidence.json` has `schemaVersion: 1`, source-file SHA-256, origin label, normalized rows, metric-specific paired coverage, task-level quality interval, and warnings. It is intended for local analysis and the policy gate.

The output does not authenticate measurements. Preserve raw originals and version/configuration details yourself. Default imports are labeled `unverified-import`; `--data-kind synthetic` marks demonstration data explicitly. Changing the label does not turn a fixture into a real experiment.
