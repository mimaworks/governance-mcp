import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ── Response types — matches backend DeriveControlsResponse ──────────────────

export interface UncoveredControl {
  control_id: string;
  framework: string;
  /** Record types whose map_controls() output includes this control_id. */
  record_types: string[];
}

export interface DeriveControlsResponse {
  /** Echoed from request — Claude's primary reasoning context. */
  action_description: string;
  /** From ledger (ai_risk_assessment record) or caller-asserted param. Null if unknown. */
  system_risk_tier: string | null;
  /** From ledger (ai_risk_assessment payload). Null if not registered or not set. */
  annex_iii_category: string | null;
  /** Deterministic from ledger. null = honest unknown (unregistered, no tier param). */
  art14_applicable: boolean | null;
  uncovered_required_controls: UncoveredControl[];
  covered_control_ids: string[];
  total_required: number;
  total_covered: number;
}

// ── Tool definition ───────────────────────────────────────────────────────────

export const deriveControlsToolDefinition = {
  name: "derive_controls",
  description:
    "Returns your current governance coverage gaps relative to the described action.\n\n" +
    "Provides: the action description as context, uncovered required controls (with which " +
    "record types evidence them), the system's registered risk tier and Art. 14 status " +
    "where deterministic from the ledger.\n\n" +
    "Use this data to reason about which record types the described action requires " +
    "and why — then propose them via dry_run_attest before writing.\n\n" +
    "When art14_applicable is null, the system is not yet registered. Offer to run " +
    "/mima:register-systems to resolve it.",
  inputSchema: {
    type: "object" as const,
    required: ["description"],
    additionalProperties: false,
    properties: {
      description: {
        type: "string",
        minLength: 10,
        maxLength: 2000,
        description:
          "Description of the AI action, feature, or architectural decision. " +
          "Be specific about what the system does, who is affected, and whether humans are in the loop.",
      },
      system_name: {
        type: "string",
        description:
          "Name of the AI system (e.g. 'loan-scoring-v2'). Resolves risk tier and " +
          "Art. 14 status from the ledger.",
      },
      ai_risk_tier: {
        type: "string",
        enum: ["high", "limited", "minimal"],
        description:
          "Explicit risk tier assertion for unregistered systems. " +
          "Use when system is not yet registered and you know the tier. " +
          "high → art14_applicable=true (cold-start mitigation).",
      },
    },
  },
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleDeriveControls(
  args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const input = args as {
    description: string;
    system_name?: string;
    ai_risk_tier?: string;
  };

  if (!input.description || input.description.length < 10) {
    return {
      content: [{ type: "text", text: "description must be at least 10 characters." }],
      isError: true,
    };
  }

  const url = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/derive-controls`;

  const body: Record<string, unknown> = {
    action_description: input.description,
  };
  if (input.system_name) body.system_name = input.system_name;
  if (input.ai_risk_tier) body.ai_risk_tier = input.ai_risk_tier;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new GrcClientError("TIMEOUT", "Derive-controls request timed out (15s).");
    }
    throw new GrcClientError("NETWORK", "Could not reach Mima API.");
  }
  clearTimeout(timer);

  if (response.status === 401) {
    return {
      content: [{ type: "text", text: "Invalid API key. Check MIMA_API_KEY." }],
      isError: true,
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      content: [{ type: "text", text: `Mima API error (${response.status}): ${text}` }],
      isError: true,
    };
  }

  const data = (await response.json()) as DeriveControlsResponse;

  const lines: string[] = [];

  lines.push(`Coverage context for: "${data.action_description}"`);
  lines.push("");

  // System registration status
  if (data.system_risk_tier) {
    const system = input.system_name ?? "this system";
    const tier = data.system_risk_tier.toUpperCase();
    const category = data.annex_iii_category ? ` (Annex III: ${data.annex_iii_category})` : "";
    lines.push(`System: ${system}`);
    lines.push(`  Registered risk tier: ${tier}${category}`);
    if (data.art14_applicable === true) {
      lines.push(`  Art. 14 applicable: YES — registered high-risk system`);
    } else if (data.art14_applicable === false) {
      lines.push(`  Art. 14 applicable: NO — ${data.system_risk_tier} risk tier`);
    } else {
      lines.push(`  Art. 14 applicable: UNKNOWN — register Annex III category to determine`);
      lines.push(`  → Run: mima push ai_risk_assessment --system ${system} --annex-iii-category <category>`);
    }
  } else {
    const system = input.system_name ?? "(system not specified)";
    lines.push(`System: ${system}`);
    if (data.art14_applicable === true) {
      lines.push(`  Art. 14 applicable: YES (asserted via ai_risk_tier=high)`);
    } else if (data.art14_applicable === false) {
      lines.push(`  Art. 14 applicable: NO (asserted via ai_risk_tier)`);
    } else {
      lines.push(`  Art. 14 applicable: UNKNOWN — system not registered`);
      lines.push(`  → To resolve: /mima:register-systems`);
    }
  }
  lines.push("");

  // Coverage summary
  lines.push(`Coverage: ${data.total_covered} / ${data.total_required} required controls covered`);
  lines.push("");

  // Uncovered controls
  if (data.uncovered_required_controls.length > 0) {
    lines.push("Uncovered required controls:");
    const shown = data.uncovered_required_controls.slice(0, 10);
    for (const ctrl of shown) {
      const rts = ctrl.record_types.join(", ");
      lines.push(
        `  ${ctrl.control_id.padEnd(24)} (${ctrl.framework.padEnd(12)}) → evidenced by: ${rts}`
      );
    }
    const remaining = data.uncovered_required_controls.length - shown.length;
    if (remaining > 0) {
      lines.push(`  ... (${remaining} more)`);
    }
  } else {
    lines.push("All required controls are covered.");
  }

  // Covered controls (compact)
  if (data.covered_control_ids.length > 0) {
    lines.push("");
    const shown = data.covered_control_ids.slice(0, 5);
    const remaining = data.covered_control_ids.length - shown.length;
    const suffix = remaining > 0 ? ` (+ ${remaining} more)` : "";
    lines.push(`Currently covered: ${shown.join(", ")}${suffix}`);
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
