import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface EvidenceRecord {
  id:              string;
  record_type:     string;
  system_name:     string;
  identity:        string | null;
  resource:        string | null;
  mapped_controls: string[];
  occurred_at:     string;
  created_at:      string;
  source:          string;
}

export interface EvidenceListResponse {
  records: EvidenceRecord[];
  total:   number;
}

export const listEvidenceToolDefinition = {
  name: "list_evidence",
  description:
    "List evidence records from the governance ledger, optionally filtered by system and time.\n\n" +
    "Use this to understand what evidence already exists before proposing new records — " +
    "prevents duplicate attestations and helps the agent reason about gaps:\n\n" +
    "- 'Has loan-scoring-v2 had a human_oversight record in the last 30 days?'\n" +
    "- 'What evidence does the chatbot system have for EU AI Act controls?'\n" +
    "- 'Show me the last 10 records across all systems'\n\n" +
    "Returns records ordered newest-first. Default limit 20, max 100.\n" +
    "The `source` field is 'sdk' (attested) or 'inferred' (estate scan — lower audit weight).",
  inputSchema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      system_name: {
        type: "string",
        description: "Filter to a specific AI system. Omit to see records across all systems.",
      },
      since: {
        type: "string",
        description:
          "ISO 8601 timestamp — only return records at or after this time. " +
          "E.g. '2026-06-01T00:00:00Z' or '2026-05-01T00:00:00Z' for the last month.",
      },
      limit: {
        type: "number",
        description: "Max records to return. Default 20, max 100.",
      },
    },
  },
};

export async function handleListEvidence(
  args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const input = args as {
    system_name?: string;
    since?:       string;
    limit?:       number;
  };

  const params = new URLSearchParams();
  if (input.system_name) params.set("system_name", input.system_name);
  if (input.since)       params.set("since", input.since);
  if (input.limit)       params.set("limit", String(Math.min(input.limit, 100)));

  const base = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/evidence`;
  const url  = params.toString() ? `${base}?${params}` : base;

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
      throw new GrcClientError("TIMEOUT", "Request timed out.");
    }
    throw new GrcClientError("NETWORK", "Could not reach Mima API.");
  }
  clearTimeout(timer);

  if (response.status === 401) {
    return { content: [{ type: "text", text: "Invalid API key." }], isError: true };
  }
  if (!response.ok) {
    return { content: [{ type: "text", text: `API error (${response.status}).` }], isError: true };
  }

  const data = (await response.json()) as EvidenceListResponse;

  const lines: string[] = [];
  const filterDesc = [
    input.system_name ? `system: ${input.system_name}` : null,
    input.since       ? `since: ${input.since}` : null,
  ].filter(Boolean).join(", ");

  lines.push(
    `Evidence records: ${data.records.length} shown of ${data.total} total` +
    (filterDesc ? ` (${filterDesc})` : "")
  );

  if (data.records.length === 0) {
    lines.push("No records found matching these filters.");
  } else {
    lines.push("");
    for (const r of data.records) {
      const source = r.source === "sdk" ? "[attested]" : "[inferred]";
      lines.push(`${r.occurred_at.slice(0, 10)}  ${r.record_type}  ${r.system_name}  ${source}`);
      if (r.mapped_controls.length > 0) {
        lines.push(`  Controls: ${r.mapped_controls.join(", ")}`);
      }
      if (r.identity) lines.push(`  Identity: ${r.identity}`);
    }
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
