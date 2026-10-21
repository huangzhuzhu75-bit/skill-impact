---
name: agents-md-audit
description: Audit AGENTS.md or CLAUDE.md for stale references, repeated rules and ambiguous constraints. Use when reviewing agent instruction files; static hints do not measure task success.
license: MIT
---

# Instruction audit

Read the target and repository rules. Resolve this skill's scripts relative to this file.
Run `python <skill-dir>/scripts/audit.py <file> --root <repo-root> --format json` when Python 3.10+ is available, or `node <ctx-eval-repo>/src/cli.ts audit <file>` for a lighter Node-only review.

Inspect flagged references before proposing a fix. Distinguish errors from heuristics; preserve operational facts and user constraints. A shorter file or better lint score does not demonstrate better agent results. Return a proposed candidate/diff and issues with line references. Apply reversible edits already authorized by the user; otherwise leave the original intact. Do not print credential values.

For measured effectiveness use the prompt-lab Skill if supplied, or ctx-eval with independent tasks and deterministic checks. Do not infer that a repository overview is useless from its category alone.
