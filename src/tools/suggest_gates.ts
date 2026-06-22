import { GrcClientError } from "../client.js";
import type { ClientConfig } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GatePolicyStatus {
  framework: string;
  mode: string;
  threshold_pct: number;
  current_pct: number;
  status: string;
  scope: string;
}

interface GatePoliciesResponse {
  policies: GatePolicyStatus[];
  unconfigured_frameworks: string[];
}

interface PostureBriefResponse {
  overall_pct: number;
  frameworks: { framework: string; score_pct: number }[];
  failing_gates: string[];
  unattested_24h: number;
}

export interface GateSuggestion {
  priority: "urgent" | "recommend" | "consider";
  action: "increase_coverage" | "add_required_gate" | "add_advisory_gate" | "promote_to_required";
  framework: string;
  framework_label: string;
  current_pct: number;
  threshold_pct: number | null;
  gap_pct: number | null;
  rationale: string;
}

export interface SuggestGatesResponse {
  suggestions: GateSuggestion[];
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FRAMEWORK_LABELS: Record<string, string> = {
  soc2_type2: "SOC 2 Type II",
  iso_27001:  "ISO 27001:2022",
  iso_42001:  "ISO 42001",
  eu_ai_act:  "EU AI Act",
  nist_airf:  "NIST AI RMF",
};

function label(slug: string): string {
  return FRAMEWORK_LABELS[slug] ?? slug;
}

async function fetchJson<T>(url: string, apiKey: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
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
    throw new GrcClientError("UNAUTHORIZED", "Invalid API key.");
  }
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

// ── Tool definition ───────────────────────────────────────────────────────────

export const suggestGatesToolDefinition = {
  name: "suggest_gates",
  description:
    "Analyse the current governance posture and gate configuration, then return " +
    "a prioritised list of gate recommendations.\n\n" +
    "Suggestions are one of four actions:\n" +
    "  • increase_coverage   — a required gate is failing; push more evidence\n" +
    "  • add_required_gate   — a framework scores well enough to gate CI on it\n" +
    "  • add_advisory_gate   — an unconfigured framework has real coverage; worth tracking\n" +
    "  • promote_to_required — an advisory gate has been passing steadily; safe to make required\n\n" +
    "Use this when:\n" +
    '- "What gates should we add?"\n' +
    '- "How do we improve our gate coverage?"\n' +
    '- "Which frameworks are ready to become required gates?"\n' +
    '- "We have no gates configured — where do we start?"',
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleSuggestGates(
  _args: unknown,
  config: ClientConfig
): Promise<CallToolResult> {
  const base = `${config.baseUrl}/api/workspaces/${config.workspaceId}/governance/grc`;

  // Fetch both endpoints in parallel.
  let gates: GatePoliciesResponse | null;
  let posture: PostureBriefResponse | null;

  try {
    [gates, posture] = await Promise.all([
      fetchJson<GatePoliciesResponse>(`${base}/gates`, config.apiKey),
      fetchJson<PostureBriefResponse>(`${base}/posture-brief`, config.apiKey),
    ]);
  } catch (err) {
    if (err instanceof GrcClientError && err.code === "UNAUTHORIZED") {
      return {
        content: [{ type: "text", text: "Invalid API key. Check MIMA_API_KEY." }],
        isError: true,
      };
    }
    throw err;
  }

  if (!gates || !posture) {
    return {
      content: [{ type: "text", text: "Could not load gate or posture data from Mima API." }],
      isError: true,
    };
  }

  // Build a score lookup from posture data.
  const scoreMap = new Map<string, number>(
    posture.frameworks.map((f) => [f.framework, f.score_pct])
  );

  const suggestions: GateSuggestion[] = [];

  // ── 1. Required gates that are failing ────────────────────────────────────
  for (const p of gates.policies) {
    if (p.mode === "required" && p.status === "failing" && p.scope === "workspace") {
      const gap = p.threshold_pct - p.current_pct;
      suggestions.push({
        priority: "urgent",
        action: "increase_coverage",
        framework: p.framework,
        framework_label: label(p.framework),
        current_pct: p.current_pct,
        threshold_pct: p.threshold_pct,
        gap_pct: gap,
        rationale:
          `${label(p.framework)} is a required gate but is only at ${p.current_pct}% ` +
          `(threshold: ${p.threshold_pct}%). Deployments are blocked until this gap of ` +
          `${gap} percentage point${gap === 1 ? "" : "s"} is closed. ` +
          `Push more evidence records via the SDK or connect GitHub for an automated scan.`,
      });
    }
  }

  // ── 2. Advisory gates close to their threshold (at risk) ─────────────────
  for (const p of gates.policies) {
    if (p.mode === "advisory" && p.scope === "workspace") {
      const gap = p.threshold_pct - p.current_pct;
      if (gap > 0 && gap <= 15) {
        suggestions.push({
          priority: "recommend",
          action: "increase_coverage",
          framework: p.framework,
          framework_label: label(p.framework),
          current_pct: p.current_pct,
          threshold_pct: p.threshold_pct,
          gap_pct: gap,
          rationale:
            `${label(p.framework)} advisory gate is at ${p.current_pct}% — ` +
            `only ${gap} point${gap === 1 ? "" : "s"} below the ${p.threshold_pct}% threshold. ` +
            `Address this now before the gap widens.`,
        });
      }
    }
  }

  // ── 3. Advisory gates passing steadily → suggest promoting to required ────
  for (const p of gates.policies) {
    if (p.mode === "advisory" && p.scope === "workspace" && p.status === "passing") {
      const margin = p.current_pct - p.threshold_pct;
      if (margin >= 15) {
        suggestions.push({
          priority: "recommend",
          action: "promote_to_required",
          framework: p.framework,
          framework_label: label(p.framework),
          current_pct: p.current_pct,
          threshold_pct: p.threshold_pct,
          gap_pct: null,
          rationale:
            `${label(p.framework)} advisory gate is passing with ${margin} points of headroom ` +
            `(${p.current_pct}% vs ${p.threshold_pct}% threshold). ` +
            `Promote it to required to enforce this bar in CI.`,
        });
      }
    }
  }

  // ── 4. Unconfigured frameworks with meaningful coverage ────────────────────
  const configuredFrameworks = new Set(
    gates.policies.filter((p) => p.scope === "workspace").map((p) => p.framework)
  );

  for (const fw of gates.unconfigured_frameworks) {
    const score = scoreMap.get(fw) ?? 0;
    if (score >= 60) {
      suggestions.push({
        priority: "recommend",
        action: "add_required_gate",
        framework: fw,
        framework_label: label(fw),
        current_pct: score,
        threshold_pct: 80,
        gap_pct: score >= 80 ? 0 : 80 - score,
        rationale:
          `${label(fw)} has ${score}% coverage but no gate is configured. ` +
          (score >= 80
            ? `At ${score}% you already meet the standard 80% bar — add a required gate to enforce it in CI.`
            : `At ${score}% you are ${80 - score} points from an 80% required gate. ` +
              `Add an advisory gate now to start tracking progress.`),
      });
    } else if (score >= 20) {
      suggestions.push({
        priority: "consider",
        action: "add_advisory_gate",
        framework: fw,
        framework_label: label(fw),
        current_pct: score,
        threshold_pct: 60,
        gap_pct: score >= 60 ? 0 : 60 - score,
        rationale:
          `${label(fw)} has ${score}% coverage with no gate. ` +
          `Add an advisory gate at 60% to track improvement without blocking CI.`,
      });
    }
    // If score < 20 and unconfigured, no suggestion — not enough signal yet.
  }

  // ── 5. If nothing configured at all, give a starter suggestion ────────────
  if (gates.policies.length === 0) {
    // Find the best-scoring framework to recommend as first gate.
    const best = posture.frameworks
      .filter((f) => f.score_pct > 0)
      .sort((a, b) => b.score_pct - a.score_pct)[0];

    if (best) {
      suggestions.push({
        priority: "recommend",
        action: best.score_pct >= 80 ? "add_required_gate" : "add_advisory_gate",
        framework: best.framework,
        framework_label: label(best.framework),
        current_pct: best.score_pct,
        threshold_pct: best.score_pct >= 80 ? 80 : 60,
        gap_pct: best.score_pct >= 80 ? 0 : 60 - best.score_pct,
        rationale:
          `No gates are configured yet. ${label(best.framework)} has the strongest coverage ` +
          `at ${best.score_pct}% — start here.`,
      });
    } else {
      suggestions.push({
        priority: "consider",
        action: "add_advisory_gate",
        framework: "eu_ai_act",
        framework_label: label("eu_ai_act"),
        current_pct: 0,
        threshold_pct: 80,
        gap_pct: 80,
        rationale:
          "No gates configured and no evidence collected yet. " +
          "Connect GitHub or install the SDK, then add an EU AI Act advisory gate " +
          "to start tracking coverage.",
      });
    }
  }

  // ── Sort: urgent first, then recommend, then consider ─────────────────────
  const ORDER = { urgent: 0, recommend: 1, consider: 2 };
  suggestions.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);

  // ── Build human-readable output ────────────────────────────────────────────
  const urgentCount   = suggestions.filter((s) => s.priority === "urgent").length;
  const recommendCount = suggestions.filter((s) => s.priority === "recommend").length;

  let summary: string;
  if (suggestions.length === 0) {
    summary = "Gate configuration looks complete. No changes recommended.";
  } else if (urgentCount > 0) {
    summary = `${urgentCount} urgent gap${urgentCount > 1 ? "s" : ""} blocking CI, ` +
      `plus ${recommendCount} improvement${recommendCount !== 1 ? "s" : ""} recommended.`;
  } else {
    summary = `${suggestions.length} gate suggestion${suggestions.length !== 1 ? "s" : ""} — no blockers.`;
  }

  const lines: string[] = [summary, ""];

  const PRIORITY_HEADER: Record<string, string> = {
    urgent:    "URGENT — fix to unblock CI",
    recommend: "RECOMMENDED",
    consider:  "CONSIDER",
  };

  let lastPriority = "";
  for (const s of suggestions) {
    if (s.priority !== lastPriority) {
      if (lastPriority) lines.push("");
      lines.push(`── ${PRIORITY_HEADER[s.priority]} ──────────────────────`);
      lastPriority = s.priority;
    }
    lines.push(`  ${s.framework_label} (${s.current_pct}%)`);
    lines.push(`  Action: ${s.action}`);
    lines.push(`  ${s.rationale}`);
    lines.push("");
  }

  const result: SuggestGatesResponse = { suggestions, summary };

  return {
    content: [
      { type: "text", text: lines.join("\n").trimEnd() },
      { type: "text", text: JSON.stringify(result) },
    ],
  };
}
