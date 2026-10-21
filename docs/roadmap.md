# Roadmap

This is an early alpha. Items below are plans, not shipped capabilities or user-adoption claims.

## Current scope

- Offline import of documented per-run benchmark and ctx-eval artifacts.
- Explicit metric units, paired coverage, exploratory quality intervals, and missing-data handling.
- HTML/SVG/CSV/LaTeX/JSON output and a configurable maintenance-policy gate.
- A self-contained reporting Skill, synthetic compatibility fixture, and offline tests.

## Next evidence milestones

1. Import a redistributable real experiment with inspectable original measurements and documented controls.
2. Get maintainers to try the workflow and identify whether it actually reduces report preparation or catches otherwise-missed errors.
3. Add format/version fixtures for a dedicated agent-skill-eval adapter, then evaluate demand for Promptfoo/Inspect adapters.
4. Record actual skill activation and provider-reported model identity where a runner supports them; never infer these from declared configuration alone.
5. Add robust session-level comparison, distribution plots and larger-sample validation before making stronger statistical claims.

Public results will retain regressions and null findings. Stars, funding and endorsement are not guaranteed or represented as product capabilities.
