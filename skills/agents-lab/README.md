# agents-lab — Agent Skills for instruction-file quality

Experimental Skills for auditing and proposing changes to agent instruction files. A static audit or suggested rewrite is not evidence of effectiveness.

| Skill | Answers | Deterministic? |
|---|---|---|
| `agents-md-audit` | Is the file well-formed and current? | Yes — `scripts/audit.py` |
| `agents-md-ablate` | Does the file actually improve outcomes? | Statistical — via `ctx-eval` or manual protocol |
| `agents-md-optimize` | Which lines earn their tokens? | Measurement-driven rewrite loop |

## Install

Copy the skill directories into your agent's skills location, e.g.:

```bash
# WorkBuddy
cp -r agents-md-* ~/.workbuddy/skills/

# Claude Code
cp -r agents-md-* ~/.claude/skills/
```

Then ask your agent: *"Audit my AGENTS.md"*, *"Does my AGENTS.md actually help?"*,
or *"Optimize my instruction file"*.

## Relationship to ctx-eval

`agents-md-ablate` uses the experimental `ctx-eval` CLI when available. The two meaningful arms are none/always-on; selective currently aliases always-on. A missing runner produces an experiment specification rather than fabricated results. The audit script is standalone.

## Evidence

No performance claim is made by these Skills. Evaluate candidates on independent tasks and report quality, cost, timing and uncertainty. The main reporting entrypoint is `skills/skill-impact`.
