import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface PostureBriefResponse {
  overall_pct: number;
  frameworks: { framework: string; score_pct: number }[];
  failing_gates: string[];
  unattested_24h: number;
}

export const postureToolDefinition = {
  name: "get_posture",
  description:
    "Get the current AI governance posture for this workspace. Returns per-framework " +
    "compliance scores (EU AI Act, SOC 2, ISO 42001, NIST AI RMF), failing gates, " +
    "and the count of unattested AI calls in the last 24 hours.\n\n" +
    "Use this to answer questions like:\n" +
    '- "How compliant are we with the EU AI Act?"\n' +
    '- "What is our current governance score?"\n' +
    '- "Are we ready for the August deadline?"\n' +
    '- "Which frameworks have gaps?"',
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

export async function handleGetPosture(
  _args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const url = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/posture-brief`;

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

  const data = (await response.json()) as PostureBriefResponse;

  // Format a human-readable summary alongside the raw data
  const lines: string[] = [];
  lines.push(`Overall posture: ${data.overall_pct}% (weakest-link across frameworks)`);
  lines.push("");
  lines.push("Framework scores:");
  for (const fw of data.frameworks) {
    const bar = fw.score_pct >= 80 ? "PASS" : fw.score_pct >= 50 ? "AT RISK" : "FAILING";
    lines.push(`  ${fw.framework}: ${fw.score_pct}% [${bar}]`);
  }
  if (data.failing_gates.length > 0) {
    lines.push("");
    lines.push(`Failing gates (${data.failing_gates.length}):`);
    for (const g of data.failing_gates) {
      lines.push(`  - ${g}`);
    }
  }
  if (data.unattested_24h > 0) {
    lines.push("");
    lines.push(`Unattested AI calls (last 24h): ${data.unattested_24h}`);
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
