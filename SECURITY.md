# Security and data handling

Offline report and gate scripts do not call models, analytics or network services. Reports contain selected model/configuration metadata and metric summaries; inspect them before sharing. Hashes establish file identity, not authenticity.

The optional agent runner starts installed third-party CLIs and uses their configured account and network behavior. A Git worktree is not a security sandbox. A workspace-write setting is not a guarantee that history, global instructions or external services are inaccessible. Run untrusted tasks in an independently managed container or VM with limited credentials; that isolation is not implemented by this project.

Do not evaluate unknown shell scripts or tools on a production machine. Node/Bash check scripts are executable code. Grant model runs and side effects separately from report generation.

JSONL transcripts are written incrementally with output limits, and are ignored by Git by default. They may contain repository material. Do not publish raw transcripts without review. Never put credentials in fixtures or example reports.

Use GitHub private vulnerability reporting if it is available in the repository's Security tab. Otherwise, open a minimal issue requesting a private contact channel without disclosing vulnerability details, credentials or affected private systems. No response-time guarantee is claimed. Public bug reports should contain only sanitized reproductions.
