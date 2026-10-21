# Working on Skill Impact

Skill Impact imports existing per-run evaluation artifacts, produces local evidence reports, and applies configurable regression policy. It also contains experimental ctx-eval and prompt-lab tools.

Read README.md and the relevant document under docs/ before changing input or metric behavior.

- Use Node >=22.18 and zero runtime dependencies. Native TypeScript must not use parameter properties or emit-dependent syntax.
- Run `node --test "tests/**/*.test.ts"`. Offline tests must not call models or require credentials.
- Keep assertion pass rate distinct from whole-task success; completion time distinct from first-token latency; tokens distinct from characters.
- Missing telemetry remains unknown. Retain unfavorable results and per-metric paired coverage.
- Update format/methodology documentation when changing metric contracts or judgement semantics. Check scripts: 0 pass, 1 task failure, >=2 infrastructure failure.
- Use synthetic, redistributable fixtures with explicit provenance. Do not commit raw private prompts, credentials, transcripts or local execution paths.
- Reporter/gate code stays offline. Model runners must be explicit and scoped; installing the Skill does not authorize model calls, uploads or publication.
- Git worktrees are file-change isolation, not a security sandbox. Preserve source hashes and raw evidence locally when supported.
- Keep user-facing documentation and CLI help in English. Additional translations may be supplied separately.
