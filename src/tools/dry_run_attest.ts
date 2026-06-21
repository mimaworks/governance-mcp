import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { RECORD_TYPES } from "./attest.js";

export interface DryRunResponse {
  record_id:       string; // nil UUID — signals dry run
  record_type:     string;
  mapped_controls: string[];
}

export const dryRunAttestToolDefinition = {
  name: "dry_run_attest",
  description:
    "Preview which compliance controls a proposed evidence record would earn — without writing " +
    "anything to the ledger. Use this before calling `attest` to confirm the record is correct.\n\n" +
    "This is the verification step in the compliance copilot loop:\n" +
    "1. get_posture() → identify gap\n" +
    "2. dry_run_attest() → confirm this record closes it\n" +
    "3. [present to human for approval]\n" +
    "4. attest() → write the real record\n\n" +
    "Returns the same `mapped_controls` list that `attest` would return, but `record_id` is " +
    "the nil UUID (all zeros) — a clear signal no DB row was written.\n\n" +
    "Do NOT skip this step when proposing records on behalf of a human — always show them " +
    "what controls would be earned before writing.",
  inputSchema: {
    type: "object" as const,
    required: ["record_type", "payload", "system_name"],
    additionalProperties: false,
    properties: {
      record_type: {
        type: "string",
        enum: RECORD_TYPES,
        description: "The governance event type to preview.",
      },
      payload: {
        type: "object",
        description: "Event-specific fields — same schema as `attest`.",
      },
      system_name: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description: "The AI system this record would be attributed to.",
      },
      identity: {
        type: "string",
        description: "User or service identity that would be recorded.",
      },
    },
  },
};

export async function handleDryRunAttest(
  args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const input = args as {
    record_type: string;
    payload:     Record<string, unknown>;
    system_name: string;
    identity?:   string;
  };

  if (!RECORD_TYPES.includes(input.record_type as (typeof RECORD_TYPES)[number])) {
    return {
      content: [{
        type: "text",
        text: `Unknown record_type: "${input.record_type}". Valid types: ${RECORD_TYPES.join(", ")}`,
      }],
      isError: true,
    };
  }

  const url = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/evidence?dry_run=true`;

  const body: Record<string, unknown> = {
    record_type: input.record_type,
    payload:     input.payload,
    system_name: input.system_name,
  };
  if (input.identity) body.identity = input.identity;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

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
      throw new GrcClientError("TIMEOUT", "Request timed out.");
    }
    throw new GrcClientError("NETWORK", "Could not reach Mima API.");
  }
  clearTimeout(timer);

  if (response.status === 401) {
    return { content: [{ type: "text", text: "Invalid API key." }], isError: true };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { content: [{ type: "text", text: `API error (${response.status}): ${text}` }], isError: true };
  }

  const data = (await response.json()) as DryRunResponse;

  const lines = [
    `DRY RUN — nothing written to ledger.`,
    ``,
    `If you call attest("${input.record_type}", ...) for "${input.system_name}" it would earn:`,
    `  ${data.mapped_controls.length > 0 ? data.mapped_controls.join(", ") : "(no controls — check record_type and payload)"}`,
    ``,
    `Approve this record to write it: call attest() with the same arguments.`,
  ];

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify({ ...data, dry_run: true }) },
    ],
  };
}
