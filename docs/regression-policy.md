# Regression-policy reference

```sh
node bin/skill-impact.mjs gate \
  --evidence outputs/my-report/evidence.json \
  --max-quality-drop-pp 2 \
  --max-duration-increase-pct 20 \
  --max-tokens-increase-pct 20 \
  --max-cost-increase-pct 20 \
  --min-tasks 2 \
  --require quality,durationSeconds \
  --markdown outputs/my-report/pr-summary.md \
  --json outputs/my-report/gate.json
```

| Option | Default | Meaning |
|---|---:|---|
| `--max-quality-drop-pp` | 2 | Maximum allowed paired mean quality loss, in percentage points |
| `--max-duration-increase-pct` | 20 | Maximum relative completion-time increase |
| `--max-tokens-increase-pct` | 20 | Maximum relative total-token increase when known |
| `--max-cost-increase-pct` | 20 | Maximum relative reported-dollar-cost increase when known |
| `--min-tasks` | 2 | Minimum distinct quality task clusters; cannot be below 2 |
| `--require` | quality,durationSeconds | Metrics that must have complete paired coverage |
| `--allow-synthetic` | off | Permit demo input; never evidence of model performance |

Thresholds must be finite, nonnegative numbers. Unknown optional metrics produce a warning and no decision. Add `tokens` or `costUsd` to `--require` if the workflow must fail when those measurements are missing.

The policy exits 2 for insufficient evidence, invalid thresholds, incomplete source experiments, synthetic input without explicit demo permission, or undefined relative comparisons against a zero baseline. Exit 1 means a configured threshold was exceeded; exit 0 means the recorded metrics were within policy.

The gate consumes a local evidence artifact, not a signed certificate. Run it against reports generated from sources you control or have independently inspected. No automatic GitHub comment or upload is performed.

The repository's CI uses synthetic fixtures only to test compatibility. Real experiment runs should be explicit, budgeted and isolated; do not give model credentials to untrusted pull-request code.
