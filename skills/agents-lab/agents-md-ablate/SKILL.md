---
name: agents-md-ablate
description: Compare coding-task results with and without a selected AGENTS.md or CLAUDE.md using ctx-eval. Use for instruction-file effectiveness experiments, with explicit model-run scope and deterministic checks.
license: MIT
---

# Instruction ablation

Use the existing ctx-eval checkout with Node >=22.18. First run `node <ctx-eval-repo>/src/cli.ts doctor`. Confirm task inputs and deterministic checks. Node .mjs checks avoid a Bash dependency.

Show tasks × two arms × repeats and expected data exposure before model calls. Use existing authorization; ask only if model/budget scope is missing. No installation, publication or private upload is implied.

Run `node <ctx-eval-repo>/src/cli.ts run --repo <repo> --tasks <tasks> --arms none,always-on --repeats 3`. Use the same default or user-chosen model and settings in both arms. Never substitute selective for a distinct retrieval experiment: current selective behaves like always-on.

Open the generated HTML report and inspect raw failures. Report valid pairs, task count, infrastructure errors, interval, tokens and known costs. Unknown dollars are not zero. A cost limit cannot enforce dollars when the adapter does not report dollars; use an externally bounded execution scope and explain the limitation.

No pairs is insufficient evidence. An interval crossing zero does not prove benefit; a wide interval does not prove equivalence. Never repeat a CLI verdict that conflicts with these conditions without flagging it. Small or identical task samples cannot establish general effectiveness.

Worktrees isolate changes, not adversarial processes. Removing a selected file does not remove Git history, ancestor files, nested rules, global skills or model memory. Record these sources and scope the conclusion. If ctx-eval is unavailable, deliver the experiment specification and missing prerequisites; do not fabricate a hand-run result.
