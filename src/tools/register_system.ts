import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const ANNEX_III_CATEGORIES = [
  "biometric_identification",
  "critical_infrastructure",
  "education_vocational",
  "employment_management",
  "essential_services",
  "law_enforcement",
  "migration_border",
  "justice_democratic",
  "not_annex_iii",
] as const;

type AnnexCategory = typeof ANNEX_III_CATEGORIES[number];

export const registerSystemToolDefinition = {
  name: "register_system",
  description:
    "Register an AI system in the Mima governance ledger. Creates an Art. 9 risk assessment " +
    "record — required once per AI system before it processes EU persons under the EU AI Act.\n\n" +
    "Use this during design reviews or architecture discussions when a new AI system is being " +
    "planned or has just been deployed:\n" +
    '- "We\'re adding a loan scoring model to production"\n' +
    '- "This new hiring algorithm needs to be registered"\n' +
    '- "Register the content moderation system we just deployed"\n\n' +
    "Pass dry_run=true to preview which controls this registration would earn without writing " +
    "anything to the ledger. Use this before the real call to confirm the payload is correct.\n\n" +
    "Returns the record_id and mapped controls (e.g. EUAIA_ART9, ISO42001_6.1). " +
    "In dry-run mode, record_id is the nil UUID — a clear signal nothing was written.",
  inputSchema: {
    type: "object" as const,
    required: [
      "system_name",
      "risk_level",
      "risk_summary",
      "intended_purpose",
      "responsible_person",
      "art5_self_assessment",
    ],
    additionalProperties: false,
    properties: {
      system_name: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description:
          "Unique identifier for the AI system. Must match what developers pass to mima.attest(system_name=…). " +
          "Use lowercase with hyphens, e.g. 'loan-scoring-v2'.",
      },
      risk_level: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "'high' = Annex III system requiring full Art. 9 documentation. " +
          "'medium' = limited risk, transparency obligations apply. " +
          "'low' = minimal risk, no mandatory requirements.",
      },
      risk_summary: {
        type: "string",
        minLength: 20,
        description:
          "Why this system is classified at this risk level. Write a complete sentence. " +
          "Example: 'This system scores loan applications for EU consumers under Annex III §(e). " +
          "Human review is mandatory for scores below 600.'",
      },
      intended_purpose: {
        type: "string",
        minLength: 20,
        description:
          "Use case, target population, and deployment scope. Auditors check this against Annex IV §1. " +
          "Example: 'Predicts credit default probability for retail loan applicants aged 18-75 in the EU. " +
          "Assists (does not replace) manual underwriter assessment.'",
      },
      responsible_person: {
        type: "string",
        description:
          "Email of the named person accountable for this system under Art. 14. " +
          "Must be a real individual, not a team alias.",
      },
      art5_self_assessment: {
        type: "boolean",
        description:
          "Set true to certify this system does not engage in practices prohibited under Art. 5 " +
          "(subliminal manipulation, social scoring, real-time biometric identification in public spaces, etc.). " +
          "Required field — do not set to true without confirming with the system owner.",
      },
      annex_iii_category: {
        type: "string",
        enum: ANNEX_III_CATEGORIES,
        description:
          "The Annex III category for high-risk systems. Required when risk_level is 'high'. " +
          "Options: biometric_identification, critical_infrastructure, education_vocational, " +
          "employment_management, essential_services, law_enforcement, migration_border, justice_democratic.",
      },
      system_version: {
        type: "string",
        description: "Optional version string, e.g. 'v2.1.0'. Auditors use this to track change events.",
      },
      environment: {
        type: "string",
        enum: ["production", "staging", "development"],
        description: "Deployment environment. Defaults to 'production'.",
      },
      technical_doc_url: {
        type: "string",
        description: "URL to Annex IV technical documentation. Must be a live URL.",
      },
      training_data_url: {
        type: "string",
        description: "URL to training dataset specification and lineage.",
      },
      dry_run: {
        type: "boolean",
        description:
          "If true, preview which controls this registration would earn without writing to the ledger. " +
          "record_id in the response will be the nil UUID. Use this before the real call.",
      },
    },
  },
};

export async function handleRegisterSystem(
  args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const input = args as {
    system_name: string;
    risk_level: "high" | "medium" | "low";
    risk_summary: string;
    intended_purpose: string;
    responsible_person: string;
    art5_self_assessment: boolean;
    annex_iii_category?: AnnexCategory;
    system_version?: string;
    environment?: "production" | "staging" | "development";
    technical_doc_url?: string;
    training_data_url?: string;
    dry_run?: boolean;
  };

  // Validate: high-risk systems should have an Annex III category
  if (input.risk_level === "high" && !input.annex_iii_category) {
    return {
      content: [{
        type: "text",
        text: "annex_iii_category is required for high-risk systems. " +
              "Choose from: biometric_identification, critical_infrastructure, education_vocational, " +
              "employment_management, essential_services, law_enforcement, migration_border, justice_democratic.",
      }],
      isError: true,
    };
  }

  const payload: Record<string, unknown> = {
    risk_level:           input.risk_level,
    risk_summary:         input.risk_summary,
    intended_purpose:     input.intended_purpose,
    art5_self_assessment: input.art5_self_assessment,
  };
  if (input.annex_iii_category) payload.annex_iii_category = input.annex_iii_category;
  if (input.system_version)     payload.system_version     = input.system_version;
  if (input.technical_doc_url)  payload.technical_doc_url  = input.technical_doc_url;
  if (input.training_data_url)  payload.training_data_url  = input.training_data_url;

  const body = {
    record_type:  "ai_risk_assessment",
    system_name:  input.system_name,
    identity:     input.responsible_person,
    environment:  input.environment ?? "production",
    occurred_at:  new Date().toISOString(),
    payload,
  };

  const base = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/evidence`;
  const url = input.dry_run ? `${base}?dry_run=true` : base;
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
        `If you call register_system("${input.system_name}", ...) it would earn:`,
        `  ${data.mapped_controls.length > 0 ? data.mapped_controls.join(", ") : "(no controls — check payload fields)"}`,
        `  Risk level: ${input.risk_level}${input.annex_iii_category ? ` — Annex III: ${input.annex_iii_category}` : ""}`,
        ``,
        `Approve this registration to write it: call register_system() with dry_run omitted or false.`,
      ]
    : [
        `AI system "${input.system_name}" registered successfully.`,
        `Record ID: ${data.record_id}`,
        `Risk level: ${input.risk_level}${input.annex_iii_category ? ` — Annex III: ${input.annex_iii_category}` : ""}`,
        `Responsible person: ${input.responsible_person}`,
        `Controls earned: ${data.mapped_controls.join(", ")}`,
        ``,
        `Next step: ensure developers call mima.attest(system_name="${input.system_name}", ...) ` +
        `so runtime evidence flows into the same ledger.`,
      ];

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
