import type { ClientConfig, EvidenceRequest, EvidenceResponse } from "./types.js";

const TIMEOUT_MS = 10_000;

export async function postEvidence(
  config: ClientConfig,
  req: EvidenceRequest
): Promise<EvidenceResponse> {
  const url = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc/evidence`;

  const body: Record<string, unknown> = {
    record_type: req.record_type,
    payload: req.payload,
    system_name: req.system_name,
  };
  if (req.identity !== undefined) body.identity = req.identity;
  if (req.resource !== undefined) body.resource = req.resource;
  if (req.environment !== undefined) body.environment = req.environment;
  if (req.occurred_at !== undefined) {
    body.occurred_at = req.occurred_at;
  } else {
    body.occurred_at = new Date().toISOString();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      throw new GrcClientError("TIMEOUT", "Could not reach Mima API. Evidence not recorded.");
    }
    throw new GrcClientError("NETWORK", "Could not reach Mima API. Evidence not recorded.");
  }

  clearTimeout(timer);

  if (response.status === 401) {
    throw new GrcClientError("UNAUTHORIZED", "Invalid API key. Check MIMA_API_KEY in .mcp.json.");
  }

  if (response.status === 400) {
    const text = await response.text().catch(() => "");
    throw new GrcClientError("BAD_REQUEST", `Unknown record_type or invalid request: ${text}`);
  }

  if (response.status === 422) {
    const text = await response.text().catch(() => "");
    throw new GrcClientError("VALIDATION", `Payload validation failed: ${text}`);
  }

  if (!response.ok) {
    throw new GrcClientError("SERVER_ERROR", `Mima API error (${response.status}). Evidence not recorded.`);
  }

  const data = await response.json() as EvidenceResponse;
  return data;
}

export class GrcClientError extends Error {
  constructor(
    public readonly code: "TIMEOUT" | "NETWORK" | "UNAUTHORIZED" | "BAD_REQUEST" | "VALIDATION" | "SERVER_ERROR",
    message: string
  ) {
    super(message);
    this.name = "GrcClientError";
  }
}
