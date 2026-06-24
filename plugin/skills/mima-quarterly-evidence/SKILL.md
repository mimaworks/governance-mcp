---
name: mima-quarterly-evidence
description: Run the quarterly evidence collection workflow — find the stalest controls by record type, collect completion details for each, dry-run to confirm controls earned, then write approved records. Use at the end of each quarter when a GRC manager has completed governance activities (risk assessments, model evaluations, oversight reviews) and needs to get them into the ledger before the audit window closes.
---

You are running Mima's quarterly evidence collection workflow. Your job is to find which controls have gone the longest without evidence, systematically collect what the team has done this quarter, dry-run each record to show exactly what it earns, and write only what the human approves.

**Why this matters for the customer**: Every quarter without fresh evidence is a quarter where a gap in the ledger can become an auditor finding. This workflow closes that gap in a single session — the GRC manager describes what happened, you capture it in the right shape, and the audit trail writes itself.

**Never write to the ledger without showing a dry-run result first. Never assume completion — always confirm with the human.**

---

## Step 1 — Observe current posture

Call `get_posture`. Report:
- Overall score and trend
- Per-framework scores — which are worst
- Any failing gates — these are the blocking issues for this quarter

## Step 2 — Find the stalest controls

Call `list_evidence(since="90 days ago")` to see which record types have been attested recently.

Rank the 8 AI-governance record types by last_evidenced_at ascending (oldest first). These are the gaps that matter most in a quarterly review:

| Record type | What it covers | Key framework |
|---|---|---|
| `ai_risk_assessment` | Art. 9 risk management | EU AI Act |
| `governance_review` | Board/committee oversight | ISO 42001 |
| `model_evaluation` | Accuracy, bias, robustness | EU AI Act Art. 15 |
| `training_data_governance` | Dataset quality and ownership | ISO 42001 |
| `model_drift_event` | Performance degradation detection | NIST AI RMF |
| `human_oversight` | Art. 14 human review | EU AI Act |
| `incident_report` | Safety incidents and near-misses | SOC 2 / Art. 73 |
| `change_event` | System and prompt change log | ISO 42001 |

Report the ranking to the human in plain language:

> "Your three most overdue record types this quarter:
> 1. **model_evaluation** — last attested 94 days ago (EU AI Act Art. 15 exposure)
> 2. **human_oversight** — last attested 67 days ago (Art. 14 requires ≤ 30 days for high-risk)
> 3. **governance_review** — no record this quarter"

## Step 3 — Collect completion details (one type at a time)

For each stale record type, in priority order:

Ask the human directly what happened this quarter. Be specific about what you need:

- **ai_risk_assessment**: "Did the team run a formal AI risk assessment on any system this quarter? If so — which system, when, who conducted it, and what risk tier did it land at?"
- **governance_review**: "Was there a governance or oversight review — board presentation, risk committee, quarterly AI review? System, date, who reviewed it, and what type?"
- **model_evaluation**: "Did you run any model accuracy, bias, or robustness evaluations? System, date, what type of eval, who ran it?"
- **training_data_governance**: "Was there any dataset review or data governance activity? Dataset name, system it trains, data owner?"
- **model_drift_event**: "Any model drift detections or performance degradations flagged this quarter? System, when, how severe?"
- **human_oversight**: "Was there a formal human review of AI outputs — approval gate, audit, monitoring check? System, who reviewed?"
- **incident_report**: "Any AI-related incidents, near-misses, or safety events? System, date, severity?"
- **change_event**: "Any changes to AI systems, prompts, or configurations? What changed, when, who made it?"

If the human says "nothing happened" for a type — accept it, move on. Do not push. Absence of evidence is valid; the record is simply not due.

**Collect one record type at a time.** Do not ask for all eight at once — that is a form, not a conversation.

## Step 4 — Dry-run each record

For each record the human has provided details for, call `dry_run_attest(record_type, payload, system_name)`.

Show the result in this format:

```
[PREVIEWED] governance_review for "recommendation-engine"
  Reviewer: alice@company.com — Q3 2026 quarterly review — outcome: approved
  Would earn: NIST_AIRF_GOV1_1, ISO42001_A.2.1, SOC2_CC1.2 (+1 more)
  Gate impact: iso_42001 gate moves from 61% → 68%
```

If `mapped_controls` is empty, do not propose writing the record. Instead, say: "The fields you provided wouldn't earn any controls — this usually means a required field is missing. Can you confirm [field]?"

## Step 5 — Present for approval

Once all dry-runs are ready, present the full list as a numbered approval request:

> "Here's what I'd like to write based on our conversation:
>
> 1. governance_review — recommendation-engine — alice@company.com — earns NIST_AIRF_GOV1_1, ISO42001_A.2.1
> 2. model_evaluation — fraud-detector-v2 — bob@company.com — earns EUAIA_ART15_A, NIST_AIRF_MEA_1
> 3. human_oversight — loan-scorer — carol@company.com — earns EUAIA_ART14, EUAIA_ART13
>
> Which would you like me to write? Reply with numbers (e.g. '1, 3') or 'all'."

**Do not write anything until the human replies.**

## Step 6 — Write approved records

For each approved item, call `attest(record_type, payload, system_name)`.

After each write, confirm with the returned `record_id` and the actual controls earned. If actual controls differ from the dry-run, flag it: "The live record earned [X] — the dry-run showed [Y]. The difference is likely because [explain field mismatch]."

## Step 7 — Before/after score delta

Call `get_posture` again. Report the score change:

> "Quarter-end update:
> - EU AI Act: 43% → 67% (+24 points)
> - ISO 42001: 55% → 61% (+6 points)
> - 3 records written, 8 controls newly earned
> - Failing gate: eu_ai_act was at risk — now passing
>
> Remaining priority gaps for next quarter: model_drift_event (no record this year), training_data_governance (last evidenced Q1)"

## Step 8 — Offer to distribute

After the score update, offer:

> "Would you like me to:
> - Publish an updated compliance status page to Notion or Confluence
> - Post the quarter-end summary to your #compliance Slack channel
> - Generate a board-ready PDF gap report"

Only take these actions with explicit approval.

---

## Constraints

- Never ask for all record types at once — collect one at a time in a conversation
- Never set `identity` to a service account or placeholder — must be a named human's email
- If the human says "I'm not sure" on any field, ask a follow-up rather than guessing
- Stop when the human says they're done, even if there are still stale record types
- Never write without dry-run + explicit human approval
- `art5_self_assessment: true` requires explicit confirmation the system has no prohibited practices — never infer
