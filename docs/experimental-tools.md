# Experimental tools

The main product is the offline Skill Impact reporter and policy gate. Earlier components remain for experimentation and backwards compatibility.

## ctx-eval coding-agent runner

```sh
node bin/skill-impact.mjs legacy --help
node bin/skill-impact.mjs doctor
node bin/skill-impact.mjs legacy init
```

`src/cli.ts` supplies `init`, `run`, `report`, `gate`, `adapters`, `doctor`, `audit`, and a scripted worktree `demo`. `none` and `always-on` are the meaningful ablation arms; `selective` currently aliases `always-on`.

Real `run` commands start an installed Codex or Claude CLI and use its configured account/quota. They are not part of the free offline reporting path. Availability checks do not prove authentication, billing mode or permission to share source code with a model service.

Node `.mjs` checks require no Bash. `.sh` checks require Bash. Check exits: 0 task pass, 1 task failure, >=2 infrastructure failure. Nonzero setup exits abort a trial. Trial worktrees are outside the original repository, external check scripts are refreshed before grading, and transcripts persist separately. This is not adversarial isolation and does not block Git history or global instructions.

Codex JSONL is streamed with line/output limits; completion/failure markers and usage counters are checked. Real-agent execution remains unvalidated in this alpha. Claude output is buffered. Dollar limits only apply to actual reported dollar amounts; missing cost cannot be hard-capped.

The legacy runner's bootstrap/equivalence labels are exploratory. Prefer the primary reporter and its documented interpretation. The legacy two-run gate has a conservative lower-bound rule that differs from the primary configurable policy gate.

## Other Skills

- `skills/prompt-lab`: review prompts and check saved outputs against explicit structural assertions. No independent model benchmark is implied.
- `skills/agents-lab`: instruction-file audit, ablation and refinement guidance. The optional audit script uses Python 3.10+ standard library only. Static audit hints are not effectiveness measurements.

Use the targeted reporting Skill by default; these directories are not all installed automatically.
