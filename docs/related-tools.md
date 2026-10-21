# Relationship to existing tools

The evaluation ecosystem already contains substantial work. Skill Impact does not claim that Skill evaluation or benchmark viewers are new.

| Tool | Primary role | Relationship |
|---|---|---|
| [Vercel Skills / find-skills](https://github.com/vercel-labs/skills) | Discover and distribute Skills | Optional discovery/distribution; not a runtime dependency |
| [Anthropic skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) | Create Skills, run with/without evaluations, aggregate and review outcomes | Initial external artifact format; keep its runner and import existing results |
| [agent-skill-eval](https://github.com/tardigrde/agent-skill-eval) | Evaluate real CLI harnesses and Skill behavior | Related runner; matching artifacts may be imported explicitly, without version-wide compatibility claims |
| [Promptfoo](https://github.com/promptfoo/promptfoo) | Broad evaluation and red-teaming platform | Related platform; a dedicated importer remains on the roadmap |
| [SkillsBench](https://github.com/benchflow-ai/skillsbench) | Research benchmark for agent Skills | Potential task/result source; currently no end-to-end integration |
| [Inspect AI](https://inspect.aisi.org.uk/) | Research evaluation and log inspection | Related research tooling; currently no importer |

The intended value is convenient local delivery across supported inputs: paired metric coverage, suspicious/missing measurement notes, an offline report, an SVG for presentations, a LaTeX table, and a regression-policy summary. Existing tools may already meet your needs. External usefulness and adoption still need to be demonstrated.
