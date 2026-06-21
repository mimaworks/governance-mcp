# Mima Governance — Claude Code Plugin

Three slash commands that turn Claude into a compliance copilot for EU AI Act, SOC 2, ISO 42001, and NIST AI RMF.

## Requirements

The [Mima Governance MCP server](https://docs.mima.ai/governance/mcp-server) must be configured in your `.mcp.json`:

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

Get your API key and workspace ID from the [Mima dashboard](https://governance.mima.ai) under Settings → API Keys.

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

**Use when**: you have unregistered AI systems, or when preparing for the EU AI Act deadline.

### `/mima:check-readiness`

Produces a CISO-ready posture summary:
- Overall score with pass/at-risk/failing status
- Per-framework scores in a scannable table
- Gate status (what is passing and what is blocking)
- Unattested AI call exposure (live coverage gaps)
- Plain-language "what this means" paragraph
- Prioritised action list ordered by impact

**Use when**: you need a board-level status report, are preparing for an auditor conversation, or want a Monday-morning compliance briefing.

## How it works

These skills use the 9-tool Mima MCP server:

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

The loop design follows the audit principle: **Claude proposes, human approves, Mima records.** Nothing is written to the ledger without explicit approval.
