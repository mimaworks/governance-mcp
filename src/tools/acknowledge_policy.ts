import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const acknowledgePolicyToolDefinition = {
  name: "acknowledge_policy",
  description:
    "Record that a team member has read and understood an AI governance policy. " +
    "Generates an immutable policy_acknowledged evidence record — required for " +
    "EU AI Act Art. 9, SOC 2 CC1.4, and ISO 42001 A.5.1.\n\n" +
    "Use this when:\n" +
    '- A new employee joins and needs to acknowledge the AI use policy\n' +
    '- An AI policy has been updated and the team needs to re-acknowledge\n' +
    '- A periodic renewal acknowledgment is due (annual policy reviews)\n\n' +
    "The record is timestamped to now and cannot be modified after creation. " +
    "Auditors verify the person's email, policy version, and exact timestamp.\n\n" +
    "Pass dry_run=true to preview which controls this acknowledgment would earn without writing " +
    "anything to the ledger. Use this before the real call to confirm the payload is correct.",
  inputSchema: {
    type: "object" as const,
    required: ["person_email", "policy_name", "policy_version", "system_name"],
    additionalProperties: false,
    properties: {
      person_email: {
        type: "string",
        description:
          "Email of the person acknowledging the policy. Must be a real individual — " +
          "auditors trace acknowledgments to named persons (Art. 14).",
      },
      policy_name: {
        type: "string",
        minLength: 1,
        description: "Human-readable policy name. E.g. 'AI Use Policy' or 'Model Risk Management Policy'.",
      },
      policy_version: {
        type: "string",
        minLength: 1,
        description:
          "Version of the policy being acknowledged. Auditors verify this. " +
          "Use semantic versioning or a date, e.g. 'v3.1.0' or '2026-06-01'.",
      },
      system_name: {
        type: "string",
        minLength: 1,
        description:
          "The AI system this acknowledgment applies to. " +
          "Must match the system_name used in mima.attest(system_name=…).",
      },
      acknowledgment_type: {
        type: "string",
        enum: ["initial", "renewal", "update"],
        description:
          "'initial' = first time reading this policy. " +
          "'renewal' = periodic re-acknowledgment. " +
          "'update' = policy was revised and team is acknowledging the new version. " +
          "Defaults to 'initial'.",
      },
      policy_url: {
        type: "string",
        description:
          "URL to the versioned policy document. Strongly recommended — auditors click through " +
          "to verify what was acknowledged.",
      },
      dry_run: {
        type: "boolean",
        description:
          "If true, preview which controls this acknowledgment would earn without writing to the ledger. " +
          "record_id in the response will be the nil UUID. Use this before the real call.",
      },
    },
  },
};

export async function handleAcknowledgePolicy(
  args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const input = args as {
    person_email: string;
    policy_name: string;
    policy_version: string;
    system_name: string;
    acknowledgment_type?: "initial" | "renewal" | "update";
    policy_url?: string;
    dry_run?: boolean;
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.person_email)) {
    return {
      content: [{ type: "text", text: "person_email must be a valid email address." }],
      isError: true,
    };
  }

  const ackType = input.acknowledgment_type ?? "initial";
  const policySlug = input.policy_name.toLowerCase().replace(/\s+/g, "-");
  const versionedResource = `policy:${policySlug}:${input.policy_version}`;

  const payload: Record<string, unknown> = {
    decision:            "acknowledged",
    policy_name:         input.policy_name,
    policy_version:      input.policy_version,
    acknowledgment_type: ackType,
  };
  if (input.policy_url) payload.policy_url = input.policy_url;

  const body = {
    record_type:  "policy_acknowledged",
    system_name:  input.system_name,
    identity:     input.person_email,
    resource:     versionedResource,
    occurred_at:  new Date().toISOString(),
    payload,
  };

  const base = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/evidence`;
  const url = input.dry_run ? `${base}?dry_run=true` : base;
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

  const data = await response.json() as { record_id: string; mapped_controls: string[] };

  const isDryRun = input.dry_run === true;
  const lines = isDryRun
    ? [
        `DRY RUN — nothing written to ledger.`,
        ``,
        `If you call acknowledge_policy("${input.policy_name}" v${input.policy_version}, "${input.person_email}") it would earn:`,
        `  ${data.mapped_controls.length > 0 ? data.mapped_controls.join(", ") : "(no controls — check record_type and payload)"}`,
        ``,
        `Approve this acknowledgment to write it: call acknowledge_policy() with dry_run omitted or false.`,
      ]
    : [
        `Policy acknowledgment recorded.`,
        `Person: ${input.person_email}`,
        `Policy: ${input.policy_name} ${input.policy_version} (${ackType})`,
        `System: ${input.system_name}`,
        `Record ID: ${data.record_id}`,
        `Controls earned: ${data.mapped_controls.join(", ")}`,
      ];

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
