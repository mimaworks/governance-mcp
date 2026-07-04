# @mima-ai/governance-mcp

[![governance-mcp MCP server](https://glama.ai/mcp/servers/mimaworks/governance-mcp/badges/score.svg)](https://glama.ai/mcp/servers/mimaworks/governance-mcp)

MCP server for AI governance — push compliance evidence to [Mima](https://mima.works) from any agent, any stack, 4 lines of config.

One tool call maps to EU AI Act, ISO 42001, SOC 2, and NIST AI RMF simultaneously. Your readiness score updates automatically.

## Install

```bash
npx @mima-ai/governance-mcp
```

Or add to your MCP config:

```json
{
  "mcpServers": {
    "mima-governance": {
      "command": "npx",
      "args": ["-y", "@mima-ai/governance-mcp"],
      "env": {
        "MIMA_API_KEY": "mima_ext_...",
        "MIMA_WORKSPACE_ID": "ws-..."
      }
    }
  }
}
```

## 10 tools

| Tool | What it does |
|---|---|
| `get_posture` | Overall readiness score + per-framework breakdown |
| `list_systems` | All AI systems — registered vs unregistered |
| `list_evidence` | Evidence records filtered by system and time |
| `dry_run_attest` | Preview which controls an attestation would earn |
| `attest` | Write a GRC evidence record |
| `register_system` | Register an AI system under EU AI Act Art. 9 |
| `acknowledge_policy` | Record a policy acknowledgment |
| `derive_controls` | Recommended evidence types for a system description |
| `check_gates` | Gate pass/fail status with exit codes |
| `suggest_gates` | Prioritised gate recommendations |

## Usage — Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "mima-governance": {
      "command": "npx",
      "args": ["-y", "@mima-ai/governance-mcp"],
      "env": {
        "MIMA_API_KEY": "mima_ext_...",
        "MIMA_WORKSPACE_ID": "ws-..."
      }
    }
  }
}
```

Then ask Claude: *"Check our compliance posture"* or *"Register this AI system and suggest which controls we need."*

## Usage — Cursor / Windsurf

Add to `.cursor/mcp.json` or `.windsurf/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "mima-governance": {
      "command": "npx",
      "args": ["-y", "@mima-ai/governance-mcp"],
      "env": {
        "MIMA_API_KEY": "mima_ext_...",
        "MIMA_WORKSPACE_ID": "ws-..."
      }
    }
  }
}
```

## Dry-run support

All write tools support dry-run — preview what controls you'd earn before committing:

```
dry_run_attest({ record_type: "ai_risk_assessment", system_name: "loan-scorer" })
// → { mapped_controls: ["EUAIA_ART9", "ISO42001_6_1", "NIST_AIRF_MAP_1"] }
```

## Four frameworks, one call

| Framework | What it covers |
|---|---|
| EU AI Act | Art. 9–15 risk management, oversight, accuracy obligations |
| ISO 42001 | AI management system controls — A.6.x risk, A.9.x performance |
| SOC 2 | CC3.x–CC8.x risk, change, and incident management |
| NIST AI RMF | GOVERN, MAP, MEASURE, MANAGE functions |

## Get an API key

[mima.works](https://mima.works) → sign up → copy your key from the dashboard.

## Python SDK

For app-code attestation (decorators, batch pushes, pre-approval gates):

```bash
pip install mima-governance
```

## Docs

[docs.mima.works](https://docs.mima.works)

