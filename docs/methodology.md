# Measurement and interpretation

## Comparison unit

Two observations are paired only when task identity and repeat number match within the chosen configuration pair. Each metric uses its own complete pairs. A row missing time can still contribute to quality, while missing cost does not become a free run.

Verify the same task inputs, model/settings, permissions, grading rules, retries, cache policy and independent-session setup before attributing a difference to a Skill. The importer cannot reconstruct controls absent from source data.

## Quality

Anthropic-compatible `pass_rate` is a fraction of assertions passed. ctx-eval `passed` is an all-checks task outcome. They are labeled differently and must not be pooled without an explicit definition.

Quality change is `100 × (candidate mean − baseline mean)` percentage points. It is not relative percent improvement. Checks only verify the behavior they test; a formatting assertion does not prove factual accuracy.

## Timing, tokens, cost and tools

- Duration is end-to-end wall time, in seconds. This may include tool execution and startup overhead.
- Time to first token is separate and requires a recorded source timestamp/metric.
- Token counts need trustworthy counter provenance; character counts are not tokens. Cache and reasoning splits are not inferred.
- Cost is reported only when the source records it. Unknown is not zero. A subscription quota counter is not automatically a dollar invoice.
- Fewer tool calls may reflect efficiency, premature termination, or lower quality. Inspect outcomes before celebrating a reduction.

For non-quality metrics, the displayed reduction is `100 × (baseline − candidate) / baseline`. A negative reduction means an increase. Relative change is undefined for a zero baseline.

## Exploratory uncertainty

For quality only, the reporter resamples task clusters with replacement, retaining observations within each selected task, and calculates a 95% percentile interval. It uses 5,000 draws and seed 42. At least two task clusters are required.

An interval above zero is labeled an observed quality gain; below zero an observed regression; across zero inconclusive. These descriptions apply to the observed dataset. Tiny, identical or unrepresentative tasks can yield misleadingly narrow intervals. No general equivalence claim, calibrated p-value, tail-latency guarantee or power analysis is provided by this reporter.

A configured regression gate is a separate engineering policy; it does not convert an observed difference into statistical significance.

## Evidence and disclosure

State which results are synthetic, imported, independently measured or human-judged. Source hashes establish identity, not authenticity. Skill discovery/read/tool-execution are distinct evidence levels. A skill directory alone does not prove activation.

Use held-out tasks for claims about generalization. Retain unfavorable cases and infrastructure failures. Avoid presenting a cherry-picked example or aggregate improvement as an independent model benchmark.
