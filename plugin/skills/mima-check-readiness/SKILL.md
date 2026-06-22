---
name: mima-check-readiness
description: Produce a CISO-ready governance readiness summary — overall posture, per-framework scores, gate status, unattested call exposure, and a prioritised action list. Use when the user asks for a readiness report, compliance status, board summary, or audit preparation overview.
---

You are producing a Mima governance readiness summary. Your job is to observe the full posture, synthesise it into a CISO-readable report, and end with a concrete prioritised action list. This is the "Monday morning status" — clear, no jargon, actionable.

## Step 1 — Observe posture

Call `get_posture`. Extract:
- Overall score (%)
- Per-framework scores: EU AI Act, SOC 2, ISO 42001, NIST AI RMF
- Failing gates (name, threshold, current value)
- Unattested AI calls in the last 24h (count and top call sites)

## Step 2 — Observe systems

Call `list_systems`. Extract:
- Total systems
- Registered vs unregistered count
- For registered systems: which have thin evidence (< 3 record types)

## Step 3 — Synthesise the report

Present in this format:

---

**Governance Readiness — [today's date]**

**Overall: [score]% — [PASSING / AT RISK / FAILING]**

| Framework | Score | Status |
|-----------|-------|--------|
| EU AI Act | 67% | AT RISK |
| ISO 42001 | 82% | PASSING |
| SOC 2 | 71% | PASSING |
| NIST AI RMF | 55% | FAILING |

**Gate status**
- [gate_name]: [current]% vs [threshold]% required — [PASS / FAIL]
- (list all gates)

**AI system coverage**
- [N] systems registered, [N] unregistered (Art. 9 gap)
- Active unattested calls: [N] in the last 24h
- Top exposed call sites: [list top 3 if any]

**What this means**
[2–3 sentences in plain language for a CISO or board audience. No compliance jargon. Example: "Three of our AI systems have no formal risk assessment on file — this is the primary blocker for EU AI Act Annex III compliance before the December 2027 deadline. Article 5 prohibited-practice bans are already enforceable today; two production systems are making AI calls with no human oversight record in the last 30 days."]

---

## Step 4 — Prioritised action list

Based on the data, produce a numbered action list ordered by impact:

1. **[Action]** — [System name] — [Why it matters] — estimated gate impact
2. **[Action]** — ...
3. **[Action]** — ...

Priority order:
1. Failing required gates (block certification)
2. Unregistered high-risk systems (legal exposure)
3. Systems with zero human_oversight records in 30 days
4. Active unattested AI calls (live coverage gap)
5. Missing policy acknowledgments (SOC 2 / ISO 42001 controls)

## Step 5 — Offer next step

End with:

> "To close these gaps now, run `/mima:close-gaps`. To register unregistered systems, run `/mima:register-systems`."

Or if everything is passing:

> "All gates passing. Next recommended review: in 30 days, or after any new AI system deployment."

## Tone and format constraints

- Write for a CISO, not a compliance officer. Clear, direct, no acronym soup.
- "EU AI Act Article 9" → "formal risk assessment". "EUAIA_ART14" → "human oversight". Translate to plain language.
- The table is for scanning. The "What this means" paragraph is for understanding.
- Never pad with filler. If posture is good, say so briefly. If it is bad, say exactly what is wrong.
- Do not list every evidence record. Summarise to the signal that matters.
