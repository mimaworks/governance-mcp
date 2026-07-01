# Mima Governance — Claude Code Plugin

Four slash commands that turn Claude into a compliance copilot for EU AI Act, SOC 2, ISO 42001, and NIST AI RMF.

**Works with any stack.** The MCP server is the universal evidence path — TypeScript, Python, Go, Java, Ruby, or any language. Your AI agent calls `attest()`, GRC records land in the ledger, and framework scores move. No SDK install, no decorators, no code changes to your application.

## Requirements

The [Mima Governance MCP server](https://docs.mima.works/governance/mcp-server) must be configured in your `.mcp.json`:

```json
{
  "mcpServers": {
    "mima-governance": {
      "command": "npx",
      "args": ["-y", "@mima-ai/governance-mcp"],
      "env": {
        "MIMA_API_KEY": "your-api-key",
        "MIMA_WORKSPACE_ID": "your-workspace-id"
      }
    }
  }
}
```

Get your API key and workspace ID from the [Mima dashboard](https://governance.mima.works) under Settings → API Keys.

## Installation

```bash
claude plugin install @mima-ai/governance-mcp
```

Or copy the `skills/` directory into your project's `.claude/skills/`.

## Commands

### `/mima:close-gaps`

Runs the full compliance copilot loop:
1. Observes current posture across all frameworks
2. Identifies the top 3 highest-value gaps
3. Dry-runs proposed evidence records (shows which controls each would earn)
4. Waits for your approval before writing anything
5. Writes approved records and confirms the score moved

**Use when**: you want to improve your compliance score, fix a failing gate, or prepare for an audit.

### `/mima:register-systems`

Runs the Art. 9 intake workflow:
1. Finds every AI system with no formal risk assessment on file
2. Triages each by likely risk tier (high-risk Annex III systems flagged)
3. Collects required registration fields (never invents values)
4. Dry-runs each registration and waits for your approval
5. Registers approved systems and confirms the gap is closed

**Use when**: you have unregistered AI systems, or when preparing for an EU AI Act or ISO 42001 audit — both require a formal AI system inventory with risk assessments on file.

### `/mima:configure-gates`

Runs the gate configuration workflow:
1. Observes current gate setup (required vs advisory, pass/fail state)
2. Gets prioritised recommendations — failing gates, advisory gates ready to promote, unconfigured frameworks worth gating
3. Presents each recommendation as an explicit decision for you to approve
4. For failing required gates: shows which evidence types would close the gap fastest
5. Confirms final state after decisions are made

**Use when**: you want to set up CI gates, improve gate coverage, or a required gate is failing and blocking deploys.

### `/mima:check-readiness`

Produces a CISO-ready posture summary:
- Overall score with pass/at-risk/failing status
- Per-framework scores in a scannable table
- Gate status (what is passing and what is blocking)
- Unattested AI call exposure (live coverage gaps)
- Plain-language "what this means" paragraph
- Prioritised action list ordered by impact

**Use when**: you need a board-level status report, are preparing for an auditor conversation, or want a Monday-morning compliance briefing.

### `/mima:quarterly-evidence`

Runs the end-of-quarter governance evidence collection workflow:
1. Observes current posture and identifies failing gates
2. Ranks the 8 AI-governance record types by how long since last evidence (stalest first)
3. Asks what your team actually completed this quarter — one record type at a time, conversationally
4. Dry-runs each record to show exactly which controls it would earn before writing anything
5. Presents the full list for your approval as a numbered batch
6. Writes only what you approve, with `record_id` confirmation per write
7. Re-checks posture and reports the before/after score delta across all frameworks
8. Offers to post the quarter-end summary to Notion, Confluence, or Slack

**Why this matters**: Every quarter without fresh evidence is a quarter where a gap in the ledger can become an auditor finding. This workflow closes that gap in a single session — the GRC manager describes what happened, Claude captures it in the right shape, and the audit trail writes itself.

**Use when**: you are at the end of a quarter and a GRC manager has completed governance activities (risk assessments, model evaluations, oversight reviews) that need to land in the ledger before the audit window closes.

## How it works

These skills use the 10-tool Mima MCP server:

| Tool | What it does |
|------|-------------|
| `get_posture` | Overall score + per-framework breakdown + gate status |
| `list_systems` | All AI systems — registered vs unregistered |
| `list_evidence` | Evidence records filtered by system and time window |
| `dry_run_attest` | Preview which controls a record would earn (no write) |
| `attest` | Write an evidence record to the governance ledger |
| `register_system` | Register an AI system (Art. 9 ai_risk_assessment) |
| `acknowledge_policy` | Record a policy acknowledgment |
| `derive_controls` | Get recommended record types for a system description |
| `check_gates` | Check gate pass/fail status with exit codes |
| `suggest_gates` | Prioritised gate recommendations — what to add, promote, or fix |

The loop design follows the audit principle: **Claude proposes, human approves, Mima records.** Nothing is written to the ledger without explicit approval.

## Framework coverage

Every record type maps to whichever frameworks apply — one approval closes gaps across all four simultaneously:

| Record type | EU AI Act | ISO 42001 | SOC 2 | NIST AI RMF |
|---|---|---|---|---|
| `ai_risk_assessment` | Art. 9, Art. 11 | A.6.1, A.9.1 | CC3.1, CC3.2, CC5.1 | GOV.1, MAP.1 |
| `human_oversight` | Art. 13, Art. 14 | A.6.2, A.6.6 | — | GOV.1 |
| `model_evaluation` | Art. 9, Art. 15 | A.6.3, A.9.2 | CC3.2, CC5.1 | MEA.1 |
| `training_data_governance` | Art. 10 | A.5.4, A.6.5 | — | MAP.1 |
| `quality_management_review` | Art. 17 | A.6.1, A.6.3, A.9.1 | CC4.1, CC5.2 | GOV.1 |
| `deployer_obligations_review` | Art. 26 | A.9.2 | — | GOV.1 |
| `model_drift_event` | Art. 9, Art. 72 | A.6.4 | CC4.1, CC4.2 | MEA.2, MNG.1 |
| `incident_report` | Art. 73 | A.3.2 | CC3.3, CC4.2, CC7.3, CC7.4 | MNG.1 |
| `change_event` | — | A.6.2 | CC8.1 | — |
| `policy_acknowledged` | — | A.2.2 | CC1.4, CC2.2, CC5.1, CC5.3 | — |

**What's not in scope:** EU AI Act Art. 1–5 (scope + prohibited practices — legal determinations), Art. 51–56 (GPAI — foundation model providers only), and Art. 57–101 (regulatory apparatus, conformity assessment). Those require lawyers, not SDK calls.

`get_posture` and `/mima:check-readiness` surface all four framework scores — not just EU AI Act.
