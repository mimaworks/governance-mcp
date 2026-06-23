import { postEvidence, GrcClientError } from "../client.js";
import { fetchGateCheck } from "./gates.js";
import type { AttestInput, ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const RECORD_TYPES = [
  "access_review",
  "change_event",
  "vendor_risk",
  "policy_acknowledged",
  "incident_report",
  "ai_risk_assessment",
  "training_data_governance",
  "model_evaluation",
  "human_oversight",
  "model_drift_event",
  "governance_review",
] as const;

export const attestToolDefinition = {
  name: "attest",
  description:
    "Record a compliance evidence event in the Mima governance ledger, mapped to " +
    "EU AI Act, SOC 2 Type II, ISO 42001, and NIST AI RMF controls. " +
    "\n\n" +
    "Call this when the AI system performs a governance-relevant action that requires " +
    "an audit trail: a human reviewing or overriding an AI decision, a risk assessment " +
    "being completed, a model being evaluated for accuracy or bias, an access review, " +
    "a policy being acknowledged, or an incident being reported. " +
    "\n\n" +
    "Do NOT call this for routine AI inference calls — only for actions where a " +
    "regulator or auditor would expect documented evidence. " +
    "\n\n" +
    "Returns the record_id and the list of compliance controls earned " +
    "(e.g. EUAIA_ART14, SOC2_CC6.1). The GRC manager sees these in the " +
    "Mima governance dashboard and they count toward the readiness score.",
  inputSchema: {
    type: "object" as const,
    required: ["record_type", "payload", "system_name"],
    additionalProperties: false,
    properties: {
      record_type: {
        type: "string",
        enum: RECORD_TYPES,
        description: "The governance event type. Maps to the SDK's 11 record types.",
      },
      payload: {
        type: "object",
        description:
          "Event-specific fields. Unknown fields are stored but do not earn additional controls. " +
          "For human_oversight: { decision, reviewer, outcome_summary, system_prompt_version? }. " +
          "For ai_risk_assessment: { risk_level, risk_summary, art5_self_assessment?, mitigations? }. " +
          "For model_evaluation: { accuracy, robustness_score?, bias_metrics?, evaluated_by? }. " +
          "For incident_report: { severity, description, resolution? }.",
      },
      system_name: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        pattern: "^[a-zA-Z0-9][a-zA-Z0-9 _\\-\\.]*$",
        description: "Name of the AI system generating this record. E.g. 'loan-scoring-v2'. Alphanumeric, spaces, hyphens, underscores, and dots only.",
      },
      identity: {
        type: "string",
        description: "User or service identity performing the action. E.g. 'user@example.com'.",
      },
      resource: {
        type: "string",
        description: "The resource or entity acted upon. E.g. 'customer-id:12345'.",
      },
      environment: {
        type: "string",
        enum: ["production", "staging", "development"],
        description: "Deployment environment. Defaults to 'production' on the server side.",
      },
      occurred_at: {
        type: "string",
        description: "ISO 8601 timestamp of when the event occurred. Defaults to now.",
      },
      enforce_gates: {
        type: "boolean",
        description:
          "If true, checks all required governance gates before writing. " +
          "Recommended for production actions and high-risk systems. " +
          "If a required gate is failing, the write is blocked — use dry_run_attest " +
          "to confirm this record would earn controls that close the gap, then re-call " +
          "attest without enforce_gates once you have verified the impact.",
      },
    },
  },
};

export async function handleAttest(
  args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const input = args as AttestInput;

  // Validate record_type before making HTTP call — gives a clear error without a round-trip
  if (!RECORD_TYPES.includes(input.record_type as (typeof RECORD_TYPES)[number])) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown record_type: "${input.record_type}". Valid types: ${RECORD_TYPES.join(", ")}`,
        },
      ],
      isError: true,
    };
  }

  // ── Gate enforcement pre-flight ───────────────────────────────────────────
  if (input.enforce_gates) {
    const gates = await fetchGateCheck(config, input.system_name);

    if (gates !== null) {
      const failing = gates.results.filter(
        (g) => g.mode === "required" && g.status === "failing"
      );

      if (failing.length > 0) {
        const gateLines = failing.map(
          (g) => `  ${g.framework.padEnd(20)} ${g.current_pct}% / ${g.threshold_pct}% threshold`
        );

        return {
          content: [
            {
              type: "text",
              text: [
                `Gate enforcement blocked this write for system "${input.system_name}".`,
                "",
                "Required gates failing:",
                ...gateLines,
                "",
                "This record type is not guaranteed to close these gates.",
                "Verify the impact before proceeding:",
                `  1. Call dry_run_attest with record_type="${input.record_type}" and system_name="${input.system_name}"`,
                "     to see which controls this record would earn.",
                `  2. Call derive_controls with system_name="${input.system_name}"`,
                "     to see the full coverage gap.",
                "  3. If confirmed beneficial, re-call attest without enforce_gates.",
              ].join("\n"),
            },
            { type: "text", text: JSON.stringify(gates) },
          ],
          isError: true,
        };
      }
    }
    // Gate check failed (network/auth) — warn in structured text but proceed.
    // A gate infrastructure failure should not silently block evidence writes.
  }

  try {
    const result = await postEvidence(config, {
      record_type: input.record_type,
      payload: input.payload,
      system_name: input.system_name,
      identity: input.identity,
      resource: input.resource,
      environment: input.environment,
      occurred_at: input.occurred_at,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            record_id: result.record_id,
            record_type: result.record_type,
            mapped_controls: result.mapped_controls,
          }),
        },
      ],
    };
  } catch (err) {
    const message =
      err instanceof GrcClientError
        ? err.message
        : "Unexpected error recording governance evidence.";

    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
}
