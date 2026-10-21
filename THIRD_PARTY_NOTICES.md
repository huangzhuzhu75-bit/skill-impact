# Third-party references and licensing

Skill Impact is MIT licensed. No external runtime package or upstream evaluator implementation is vendored in this repository.

| Source | Inspected reference | Scoped license | Use |
|---|---|---|---|
| vercel-labs/skills | `a80e4c9d12d607631249d4d7d059f835d4b2f13a`, package 1.7.4 | MIT | Discovery/distribution workflow and Skill structure references |
| anthropics/skills, `skills/skill-creator` | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | Apache-2.0 for that subdirectory | Output format inspected; original aggregation script ran separately on handwritten fixtures |
| openai/codex | Local CLI protocol probe: `0.163.0-alpha.11`; upstream exec event definitions | Apache-2.0 | Event-contract reference for the experimental adapter |

The synthetic example is derived from project-authored grading/timing fixtures processed with an external upstream aggregator. Its metrics are not experimental observations of a model. Upstream template metadata is retained so missing-provenance warnings can be demonstrated.

Referenced projects retain their own licenses and trademarks. Anthropic's repository uses different licensing in different subdirectories; this table is not a blanket license statement about that repository. No affiliation or endorsement is implied.

If future contributions vendor code or assets, include the relevant scoped license and attribution in the same change.
