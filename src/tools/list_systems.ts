import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface AiSystem {
  system_name:   string;
  record_count:  number;
  last_seen:     string;
  is_registered: boolean;
  record_types:  string[];
  controls:      string[];
}

export interface SystemsResponse {
  systems: AiSystem[];
  total:   number;
}

export const listSystemsToolDefinition = {
  name: "list_systems",
  description:
    "List all AI systems in this workspace with their registration status and evidence coverage.\n\n" +
    "The key field is `is_registered`: false means the system has emitted evidence (the guard or " +
    "AST scanner detected it) but no `ai_risk_assessment` record exists — the Art. 9 intake gap.\n\n" +
    "Use this to:\n" +
    "- Identify unregistered AI systems before the EU AI Act deadline\n" +
    "- See which systems have evidence gaps (record_types shows what categories exist)\n" +
    "- Answer: \"what AI systems do we have?\" and \"which ones are formally registered?\"\n\n" +
    "Returns system_name, record_count, last_seen, is_registered, record_types[], controls[].",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

export async function handleListSystems(
  _args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const url = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/systems`;

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

  const data = (await response.json()) as SystemsResponse;

  const unregistered = data.systems.filter((s) => !s.is_registered);
  const registered   = data.systems.filter((s) => s.is_registered);

  const lines: string[] = [];
  lines.push(`AI systems in workspace: ${data.total}`);
  lines.push(`  Registered (Art. 9 ai_risk_assessment present): ${registered.length}`);
  lines.push(`  Unregistered (gap — no ai_risk_assessment): ${unregistered.length}`);

  if (unregistered.length > 0) {
    lines.push("");
    lines.push("Unregistered systems (Art. 9 intake gap):");
    for (const s of unregistered) {
      lines.push(`  ${s.system_name}`);
      lines.push(`    Last seen: ${s.last_seen}`);
      lines.push(`    Evidence records: ${s.record_count} (${s.record_types.join(", ")})`);
      lines.push(`    Controls covered: ${s.controls.length > 0 ? s.controls.join(", ") : "none"}`);
    }
  }

  if (registered.length > 0) {
    lines.push("");
    lines.push("Registered systems:");
    for (const s of registered) {
      lines.push(`  ${s.system_name} — ${s.record_count} records, ${s.controls.length} controls`);
    }
  }

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
