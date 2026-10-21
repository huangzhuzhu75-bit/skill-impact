# Contributing

Skill Impact reports should be useful to maintainers and researchers without hiding unfavorable results. Contributions are welcome for importers, reproducible examples, metric correctness and cross-platform operation.

Run with Node >=22.18; no runtime packages are required:

```sh
node --test "tests/**/*.test.ts"
node src/cli.ts doctor
```

When adding an importer, provide a small, redistributable fixture with explicit provenance and a pinned source-format version. Keep unknown units and missing fields unknown; never infer tokens from characters or first-token latency from completion time. Add tests covering missing fields, paired identity and at least one regression. Distinguish assertion-level scores from all-checks task success.

Model runs are optional, billable and excluded from the default tests. Document model/configuration, task hashes, source revision, grading method, repetitions and execution isolation. A fake or synthetic fixture is useful for compatibility tests and must be labeled. It is not performance evidence.

Bug reports should include Node/OS versions, the command and exit code, source tool/version, expected behavior, and a minimal redacted artifact. Do not attach credentials, private prompts or proprietary evaluation data.

No third-party contributions or external adoption are claimed until they actually occur. Maintainers should record releases, substantive fixes and reproducible user cases in public project history after publication.
