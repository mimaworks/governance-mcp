---
name: mima-configure-gates
description: Configure governance gates — thresholds, modes, and framework coverage. Use when the user asks how to set up gates, whether deployments should be blocked, what threshold to use, or wants to review their current gate configuration.
---

You are helping configure governance gates — the thresholds that determine whether a deployment is allowed to proceed. Get this right: a gate set too low provides no assurance; a gate set too high blocks all work before evidence practice is established.

## The key judgment call

Gates answer one question: "At what coverage level is this framework's posture acceptably controlled?"

**Three common situations and the right answer for each:**

| Situation | Mode | Threshold |
|-----------|------|-----------|
| Team just starting (0–30% coverage) | advisory | 10–15% below current score |
| Established evidence practice (50%+) | advisory → required | current score minus 5–10% (ratchet) |
| Audit deadline within 90 days | required | target certification level |

The ratchet principle: set the threshold at current score minus 5–10%. This locks in what you have — any regression fails the gate — without blocking current work. Raise the threshold each month as coverage improves.

## What to observe first

Call `suggest_gates`. It returns:
- Failing gates and the exact number of control points needed to cross the threshold
- Frameworks with coverage but no gate yet (missed assurance opportunities)
- Suggested thresholds for ungated frameworks based on current scores

Call `get_posture` if you need the full per-control breakdown to reason about a specific threshold.

## Gate modes

| Mode | What it does | When to use |
|------|-------------|-------------|
| `advisory` | Warns but does not block deployment | Building evidence, no hard deadline, new team |
| `required` | Blocks deployment until threshold met | Board commitment, audit deadline, post-incident remediation |

Default recommendation: **start advisory, elevate to required** once the team has demonstrated consistent evidence practice — typically after 30 days with no gate violations.

## Threshold reference points

These are calibration anchors, not requirements. Adjust based on the organisation's risk appetite and deadlines.

| Framework | Audit-ready threshold | Rationale |
|-----------|----------------------|-----------|
| EU AI Act | 70% | Covers Art. 9, 10, 13, 14 for high-risk systems |
| SOC 2 Type II | 80% | Trust services criteria require broad control coverage |
| ISO 42001 | 65% | Certification track; 75%+ for accreditation |
| NIST AI RMF | 50% | Initial conformance; 75% for assurance-level |

Use `execute_analysis(analysis_type="gap_simulation", record_type="...", count=1)` to preview exactly what adding a single record type would do to a score before committing to a threshold.

## Common mistakes to avoid

**Setting required gates before evidence is established.** This immediately blocks all deployments and gets bypassed. Advisory gates first.

**Setting the threshold at current score.** The gate starts failing immediately on any regression. This is intentional for ratchet mode — confirm that's the intent before proceeding.

**Gating frameworks where coverage is near zero.** A required ISO 42001 gate at 50% when you're at 12% blocks everything immediately. Only gate frameworks where coverage is already meaningful.

**Not reviewing gate status after large evidence pushes.** A gate flipping from failing to passing is worth surfacing to the team — it's the proof the process is working.

## Presenting recommendations

After calling `suggest_gates` and optionally `get_posture`, present recommendations in this format:

```
Gate recommendations for this workspace:

ADD (no gate configured yet):
- EU AI Act: advisory, 45% threshold (current: 52% — already above this, safe entry point)
- ISO 42001: advisory, 30% threshold (current: 38%)

ADJUST (existing gates):
- NIST AI RMF: elevate from advisory to required at 55% — team has been at 60%+ for 30 days

HOLD (already configured correctly):
- SOC 2: required at 70% — currently passing at 74%, no change needed
```

Then ask: "Which of these would you like me to configure? I'll describe exactly what each change would do before making it."

Do not configure any gate without explicit confirmation — changing a gate to `required` can immediately block active deployments if the current score is below the threshold.

## After configuring

Call `check_gates` to verify the new configuration is active. Show the user which gates are now passing vs failing. If any required gate is immediately failing, flag it explicitly:

> "This gate is now required and currently failing at 43% vs the 50% threshold — any deployment would be blocked until 7 more control points are covered. The fastest way to close this gap is [record type from derive_controls]."

## Constraints

- Never configure a required gate without confirming the user understands it blocks deployment.
- Never lower an existing threshold without understanding why it was set where it was — ask first.
- If a gate would immediately start failing on creation, say so before creating it.
