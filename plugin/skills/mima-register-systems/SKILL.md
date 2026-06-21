---
name: mima-register-systems
description: Run the Art. 9 intake workflow — find every AI system without an ai_risk_assessment record, gather the required fields, and register each one. Use when the user asks to register systems, fix Art. 9 gaps, or prepare for the EU AI Act deadline.
---

You are running the Mima Art. 9 intake workflow. Your job is to find every unregistered AI system, collect the minimum required fields, and register each one with a proper `ai_risk_assessment` record. Unregistered systems are the single highest-impact gap for EU AI Act compliance.

**Never register a system with invented values. Never infer a system's risk tier from its name or surface category. Ask for real information when required fields are missing.**

## Step 1 — Find unregistered systems

Call `list_systems`. If `unregistered` count is 0 — report that all systems are registered and stop.

Otherwise, list every unregistered system:
- System name
- Last seen date (signals how recently it was active)
- Existing evidence records / controls (signals how much is already known about it)

## Step 2 — Surface the function question for each system

Do not triage by risk tier yet. A system's name tells you nothing reliable about its risk classification. Two systems both named "chatbot" can land in entirely different tiers depending on what their output actually does.

For each unregistered system, ask the human these three questions before forming any classification view:

1. **What does the system's output actually do?** Does it inform a person, or does it (or a downstream process) determine something about them — eligibility, access, a score, an approval/denial?
2. **Is the subject matter tied to one of the Annex III domains?** Biometrics, critical infrastructure, education/training access, employment (hiring, performance, promotion, termination), access to essential services (credit, insurance, benefits, healthcare), law enforcement, migration/asylum/border, judicial/democratic processes.
3. **Who relies on the output, and for what?** There is a material difference between a system that explains a process (informational) and one whose output is used to make a determination about someone (decisional) — even when both are described with the same surface label.

If the human's description doesn't clearly resolve these: "Does this system's output ever determine or materially influence someone's access to a service, job, license, or legal status — or does it only provide information?" Treat "not sure" or a partial answer as **unclear**, not as a negative.

Once you have answers, present a candidate classification per system with explicit basis:

```
Candidate classification for support-chatbot:
  Basis: human confirmed output is informational only — explains renewal steps, does not gate access
  Candidate tier: LOW / GPAI
  Not an Annex III candidate based on confirmed function.

Candidate classification for loan-scoring-v2:
  Basis: human confirmed output is a score used by downstream process to determine credit eligibility
  Candidate tier: HIGH-RISK — Annex III, Art. 6(2), essential_services domain
  ⚠ Confirm this classification with legal/compliance before registration.
```

If the answers indicate Annex III: flag it to the human and recommend legal/compliance sign-off before proceeding. This skill can scaffold the question, not make the legal determination.

Do not proceed to Step 3 until the human has confirmed or corrected each candidate classification.

## Step 3 — Collect required fields

For each system, collect the following. Do not invent any value — ask if missing.

**Required for all systems:**
- `intended_purpose` — one sentence: what this system does in production
- `risk_tier` — high / medium / low (must reflect the confirmed function from Step 2, not the system's name)
- `use_case` — technical description (e.g. "Scores loan applications 0–1000")
- `impact_domains` — list (e.g. ["credit", "financial_services"])
- `assessor` — email of the person responsible for this system. Must be a real person's email. If unknown, ask for it — do not use placeholders.
- `art5_confirmation` — ask the human to explicitly confirm: "Please confirm that this system does not engage in any of the following prohibited practices: subliminal manipulation, exploitation of vulnerabilities, social scoring by public authorities, or real-time remote biometric surveillance in public spaces (with limited exceptions). Your explicit confirmation is required." The expected response is an affirmative: "Confirmed, it does not." If the human cannot confirm this, do not proceed — flag the system for legal review.

**Required additionally for high-risk systems (Annex III):**
- `annex_iii_category` — which Annex III category applies: biometric_categorisation, critical_infrastructure, education_vocational, employment_workers, essential_services, law_enforcement, migration_asylum, administration_of_justice, democratic_processes. If unclear, present the full list and ask the human to select.
- `training_data_url` — URL to training data documentation (optional but strongly recommended for audit trail)

## Step 4 — Dry-run each registration

Call `register_system(..., dry_run=true)` with the confirmed fields for each system. This previews which controls the registration would earn without writing anything to the ledger (record_id will be the nil UUID).

Show the result:

```
Registration dry-run for loan-scoring-v2: [PREVIEWED]
  Would earn: EUAIA_ART9, EUAIA_ART10, ISO42001_6.1, ISO42001_A.6.2
  Art. 9 intake gap: would close on registration
```

If the dry-run returns zero controls, flag it and ask the human to check the `risk_level`, `annex_iii_category`, or `intended_purpose` fields before proceeding.

## Step 5 — Present for approval

List all pending registrations with their dry-run results. For each one, include:
- The confirmed classification basis (function, not name)
- The controls the dry-run confirmed it would earn
- The `art5` confirmation status (confirmed / pending / blocked)
- For Annex III systems: whether legal/compliance sign-off has been obtained

Ask: "Which systems shall I register? Reply with numbers or 'all'."

**Do not write anything until the human responds.**

Before writing a high-risk system, confirm that:
1. The Annex III classification was confirmed by the human (not just inferred)
2. `art5_confirmation` was explicitly received in this conversation
3. Legal/compliance sign-off has been noted (even informally — "Legal has reviewed this")

If any of these are missing for a high-risk system, do not register it — ask for the missing confirmation first.

## Step 6 — Register approved systems

For each approved system, call `register_system` with the confirmed fields. When setting `art5_self_assessment`:
- Set `true` if the human explicitly confirmed in Step 3 that the system does NOT engage in any prohibited practices (i.e., the Art. 5 self-assessment is clean)
- Do not set `true` if the human has not explicitly confirmed this — leave registration incomplete and ask again

Confirm with the `record_id` returned.

## Step 7 — Verify what was actually written

After writing, compare actual controls earned against the dry-run preview from Step 4. Report any mismatch to the human:

```
loan-scoring-v2 registered. record_id: abc-123
  Dry-run preview: EUAIA_ART9, EUAIA_ART10, ISO42001_6.1, ISO42001_A.6.2
  Actual controls earned: EUAIA_ART9, ISO42001_6.1
  ⚠ Mismatch: EUAIA_ART10 and ISO42001_A.6.2 not earned — payload may need additional fields.
    Recommend reviewing the annex_iii_category or training_data_url fields.
```

If actual matches preview, confirm cleanly.

## Step 8 — Confirm impact

Call `list_systems` again. Report:
- How many systems are now registered vs before
- Any systems still unregistered and why (missing fields, human declined, legal review pending)
- Recommended next step for each newly-registered system — specifically which record types are now needed (e.g. "loan-scoring-v2 is registered but has no `human_oversight` record — Art. 14 requires one for high-risk systems")

## Constraints

- Never infer `risk_tier` or `annex_iii_category` from the system's name, label, or your own sense of "this sounds like X." Only from what the human confirms about its actual function.
- `art5_self_assessment: true` means the system has passed the Art. 5 self-assessment — confirmed by a responsible person that no prohibited practices apply. This is the correct value for a compliant, assessed system. Never set it without that explicit confirmation.
- `art5_self_assessment: false` (or absent) means the assessment has not been completed or confirmed. Do not register a high-risk system in this state.
- If the human cannot confirm `art5_self_assessment`, do not register the system — flag it for legal review.
- `assessor` must be a real person's email. If unknown, ask for it. Do not use placeholders.
- For high-risk systems, `annex_iii_category` is mandatory. If unclear which category, present the full list and ask.
- Always run `register_system(..., dry_run=true)` before the real write — never skip the preview step.
