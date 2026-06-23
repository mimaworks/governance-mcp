import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAttest, RECORD_TYPES } from "./attest.js";
import type { ClientConfig } from "../types.js";

const config: ClientConfig = {
  apiKey: "test-key",
  workspaceId: "ws-uuid-1234",
  baseUrl: "https://api.mima.ai",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  );
}

describe("handleAttest", () => {
  it("returns record_id and mapped_controls on success", async () => {
    mockFetch(200, {
      record_id: "abc-123",
      record_type: "human_oversight",
      mapped_controls: ["EUAIA_ART13", "EUAIA_ART14", "NIST_AIRF_GOV_1"],
    });

    const result = await handleAttest(
      {
        record_type: "human_oversight",
        payload: {
          decision: "approved",
          reviewer: "grc@example.com",
          system_prompt_version: "v1.0",
        },
        system_name: "loan-scoring-v2",
      },
      config
    );

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: "text"; text: string }).text);
    expect(parsed.record_id).toBe("abc-123");
    expect(parsed.mapped_controls).toContain("EUAIA_ART14");
  });

  it("returns isError for unknown record_type without making HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleAttest(
      {
        record_type: "invented_type",
        payload: {},
        system_name: "test-system",
      },
      config
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("invented_type");
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("Valid types:");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists all valid record types in error message", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const result = await handleAttest(
      { record_type: "bad_type", payload: {}, system_name: "test" },
      config
    );

    for (const type of RECORD_TYPES) {
      expect((result.content[0] as { type: "text"; text: string }).text).toContain(type);
    }
  });

  it("returns isError with API key message on 401", async () => {
    mockFetch(401, "Unauthorized");

    const result = await handleAttest(
      { record_type: "human_oversight", payload: {}, system_name: "test" },
      config
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("MIMA_API_KEY");
  });

  it("returns isError when fetch rejects (network down)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await handleAttest(
      { record_type: "human_oversight", payload: {}, system_name: "test" },
      config
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("Evidence not recorded");
  });

  it("does not throw — always returns a ToolResult", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    await expect(
      handleAttest({ record_type: "governance_review", payload: {}, system_name: "test" }, config)
    ).resolves.toBeDefined();
  });

  it("accepts all 11 valid record types", async () => {
    mockFetch(200, { record_id: "r1", record_type: "access_review", mapped_controls: [] });

    for (const recordType of RECORD_TYPES) {
      // re-stub for each call
      mockFetch(200, { record_id: "r1", record_type: recordType, mapped_controls: [] });
      const result = await handleAttest(
        { record_type: recordType, payload: {}, system_name: "test-system" },
        config
      );
      expect(result.isError).toBeFalsy();
    }
  });
});
