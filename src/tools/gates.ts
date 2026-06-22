import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface GateResult {
  framework: string;
  mode: "required" | "advisory";
  threshold_pct: number;
  current_pct: number;
  status: "passing" | "failing";
}

export interface GatesCheckResponse {
  passed: boolean;
  system_name: string | null;
  results: GateResult[];
}

// ── Reusable fetch helper (used by attest gate enforcement) ───────────────────

export async function fetchGateCheck(
  config: ClientConfig,
  systemName?: string
): Promise<GatesCheckResponse | null> {
  const url = new URL(
    `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/gates/check`
  );
  if (systemName) url.searchParams.set("system_name", systemName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as GatesCheckResponse;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export const gatesToolDefinition = {
  name: "check_gates",
  description:
    "Check the status of all configured governance gates for this workspace. " +
    "Gates are threshold-based controls that block deployments when compliance scores " +
    "drop below a required level.\n\n" +
    "Returns each gate's current score vs threshold, and whether it passes.\n\n" +
    "Use this to answer questions like:\n" +
    '- "Can we deploy right now?"\n' +
    '- "Which gates are blocking us?"\n' +
    '- "What do we need to fix before merging?"',
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

export async function handleCheckGates(
  _args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const url = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/gates/check`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new GrcClientError("TIMEOUT", "Could not reach Mima API.");
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
    return {
      content: [{ type: "text", text: `Mima API error (${response.status}).` }],
      isError: true,
    };
  }

  const data = (await response.json()) as GatesCheckResponse;

  const lines: string[] = [];
  lines.push(data.passed ? "All gates PASS — safe to deploy." : "BLOCKED — one or more required gates are failing.");
  lines.push("");

  for (const g of data.results) {
    const icon = g.status === "passing" ? "PASS" : "FAIL";
    const req = g.mode === "required" ? " (required)" : "";
    lines.push(`  [${icon}] ${g.framework}${req}: ${g.current_pct}% / ${g.threshold_pct}% threshold`);
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
