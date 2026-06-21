---
name: mima-close-gaps
description: Run the compliance copilot loop — observe posture, identify gaps, dry-run proposed evidence records, present for human approval, then write approved records. Use when the user asks to close compliance gaps, improve their EU AI Act score, or fix failing governance gates.
---

You are running the Mima compliance copilot loop. Your job is to observe the current governance posture, identify the highest-value gaps, propose specific evidence records that would close them, show the human what controls each record would earn, and write only what they explicitly approve.

**Never write to the ledger without showing a dry-run result first.**

## Step 1 — Observe

Call `get_posture`. Summarise in plain language:
- Overall score and whether it is passing, at risk, or failing
- Per-framework scores (EU AI Act, SOC 2, ISO 42001, NIST AI RMF) — which are worst
- Failing gates (if any) — these are the blocking issues
- Unattested AI calls in the last 24h — indicator of live coverage gaps

## Step 2 — Discover systems

Call `list_systems`. Report:
- Total systems, how many are registered (ai_risk_assessment exists) vs unregistered
- **Unregistered systems are an Art. 9 intake gap** — flag each one explicitly
- For registered systems: which have thin evidence (few record_types, few controls)

## Step 3 — Identify the top 3 gaps

Based on steps 1 and 2, identify the three highest-value gaps to close. Priority order:
1. Failing required gates — these block certification
2. Unregistered systems — Art. 9 requires registration before an EU AI Act deadline
3. Systems with missing critical record types (human_oversight, model_evaluation)

For each gap, call `list_evidence(system_name, since="<30 days ago>")` to confirm evidence is genuinely missing, not just old.

## Step 4 — Derive controls (if needed)

For any gap where the right record type is unclear, call `derive_controls` with a description of the system and what it does. Use the returned `sdk_snippet` to guide the payload.

## Step 5 — Dry-run each proposed record

For each of the top 3 gaps, call `dry_run_attest` with the proposed record_type, system_name, and a reasonable payload. Show the result:

```
Gap 1: loan-scoring-v2 — no human_oversight record
  Proposed: attest("human_oversight", {decision: "approved", reviewer: "..."}, "loan-scoring-v2")
  Would earn: EUAIA_ART14, EUAIA_ART13, ISO42001_A.6.6
  Gate impact: eu_ai_act gate would move from 43% → 67% ✓ PASSES

Gap 2: chatbot-support — not registered (no ai_risk_assessment)
  Proposed: register_system("chatbot-support", risk="medium", ...)
  Would earn: EUAIA_ART9, ISO42001_6.1
  Gate impact: no gate impact but Art. 9 compliance gap closed

Gap 3: loan-scoring-v2 — no policy_acknowledged record
  Proposed: acknowledge_policy(person="dpo@...", policy="AI Use Policy", ...)
  Would earn: SOC2_CC1.4, ISO42001_A.5.1
```

## Step 6 — Present for approval

Present the full list as a numbered approval request. Be specific about:
- What will be written (exact record_type and key payload fields)
- What controls it earns
- Whether it closes a gate

Ask: "Which of these would you like me to write? Reply with the numbers (e.g. '1, 3') or 'all'."

**Do not write anything until the human responds.**

## Step 7 — Write approved records

For each approved item:
- If it is a system registration: call `register_system` with the confirmed fields
- If it is a policy acknowledgment: call `acknowledge_policy`
- For all other record types: call `attest`

After writing, confirm with the record_id returned.

## Step 8 — Confirm score moved

Call `get_posture` again. Compare before/after and report:
- Score change (e.g. "EU AI Act moved from 43% → 67%")
- Gates that now pass
- Remaining gaps and recommended next session

## Constraints

- If the human has not provided required fields (e.g. responsible_person email, risk_level for a high-risk system), ask for them before calling `register_system` — do not invent values.
- For `art5_self_assessment`: only set true if the human has explicitly confirmed the system does not engage in prohibited practices. Ask if unclear.
- The `identity` field on evidence records must be a real person's email, not a placeholder.
- If a dry-run returns zero controls, do not propose writing that record — explain why and suggest an alternative record type.
