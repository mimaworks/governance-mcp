import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postEvidence, GrcClientError } from "./client.js";
import type { ClientConfig } from "./types.js";

const config: ClientConfig = {
  apiKey: "test-key",
  workspaceId: "ws-uuid-1234",
  baseUrl: "https://api.mima.works",
};

const baseRequest = {
  record_type: "human_oversight" as const,
  payload: { decision: "approved", reviewer: "grc@example.com" },
  system_name: "loan-scoring-v2",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("postEvidence", () => {
  it("sends POST to correct URL with Bearer token", async () => {
    const fetchMock = mockFetch(200, {
      record_id: "abc-123",
      record_type: "human_oversight",
      mapped_controls: ["EUAIA_ART14"],
    });

    await postEvidence(config, baseRequest);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.mima.works/api/workspaces/ws-uuid-1234/governance/grc/evidence"
    );
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("returns EvidenceResponse on 200", async () => {
    mockFetch(200, {
      record_id: "abc-123",
      record_type: "human_oversight",
      mapped_controls: ["EUAIA_ART13", "EUAIA_ART14"],
    });

    const result = await postEvidence(config, baseRequest);
    expect(result.record_id).toBe("abc-123");
    expect(result.mapped_controls).toContain("EUAIA_ART14");
  });

  it("omits optional fields when undefined", async () => {
    const fetchMock = mockFetch(200, {
      record_id: "abc-123",
      record_type: "human_oversight",
      mapped_controls: [],
    });

    await postEvidence(config, baseRequest);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("identity");
    expect(body).not.toHaveProperty("resource");
    expect(body).not.toHaveProperty("environment");
  });

  it("defaults occurred_at to ISO string when not provided", async () => {
    const fetchMock = mockFetch(200, {
      record_id: "abc-123",
      record_type: "human_oversight",
      mapped_controls: [],
    });

    await postEvidence(config, baseRequest);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(typeof body.occurred_at).toBe("string");
    expect(() => new Date(body.occurred_at)).not.toThrow();
  });

  it("passes occurred_at through when provided", async () => {
    const fetchMock = mockFetch(200, {
      record_id: "abc-123",
      record_type: "human_oversight",
      mapped_controls: [],
    });

    await postEvidence(config, { ...baseRequest, occurred_at: "2026-06-20T12:00:00Z" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.occurred_at).toBe("2026-06-20T12:00:00Z");
  });

  it("throws GrcClientError UNAUTHORIZED on 401", async () => {
    mockFetch(401, "Unauthorized");

    await expect(postEvidence(config, baseRequest)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.stringContaining("MIMA_API_KEY"),
    });
  });

  it("throws GrcClientError BAD_REQUEST on 400", async () => {
    mockFetch(400, "unknown record_type");

    await expect(postEvidence(config, baseRequest)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws GrcClientError VALIDATION on 422", async () => {
    mockFetch(422, "payload missing required field");

    await expect(postEvidence(config, baseRequest)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("throws GrcClientError SERVER_ERROR on 500", async () => {
    mockFetch(500, "internal error");

    await expect(postEvidence(config, baseRequest)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      message: expect.stringContaining("500"),
    });
  });

  it("throws GrcClientError NETWORK when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(postEvidence(config, baseRequest)).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("throws GrcClientError TIMEOUT on AbortError", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(postEvidence(config, baseRequest)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });
});
