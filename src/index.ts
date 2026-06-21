#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { attestToolDefinition, handleAttest } from "./tools/attest.js";
import { postureToolDefinition, handleGetPosture } from "./tools/posture.js";
import { gatesToolDefinition, handleCheckGates } from "./tools/gates.js";
import { deriveControlsToolDefinition, handleDeriveControls } from "./tools/derive_controls.js";
import { registerSystemToolDefinition, handleRegisterSystem } from "./tools/register_system.js";
import { acknowledgePolicyToolDefinition, handleAcknowledgePolicy } from "./tools/acknowledge_policy.js";
import { listSystemsToolDefinition, handleListSystems } from "./tools/list_systems.js";
import { listEvidenceToolDefinition, handleListEvidence } from "./tools/list_evidence.js";
import { dryRunAttestToolDefinition, handleDryRunAttest } from "./tools/dry_run_attest.js";
import type { ClientConfig } from "./types.js";

const apiKey = process.env.MIMA_API_KEY;
const workspaceId = process.env.MIMA_WORKSPACE_ID;
const baseUrl = process.env.MIMA_BASE_URL ?? "https://api.mima.ai";

if (!apiKey || !workspaceId) {
  process.stderr.write(
    "Error: MIMA_API_KEY and MIMA_WORKSPACE_ID must be set in the .mcp.json env block.\n" +
    "See: https://docs.mima.ai/governance/mcp-server\n"
  );
  process.exit(1);
}

const clientConfig: ClientConfig = { apiKey, workspaceId, baseUrl };

const server = new Server(
  { name: "mima-governance", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    attestToolDefinition,
    dryRunAttestToolDefinition,
    postureToolDefinition,
    gatesToolDefinition,
    listSystemsToolDefinition,
    listEvidenceToolDefinition,
    deriveControlsToolDefinition,
    registerSystemToolDefinition,
    acknowledgePolicyToolDefinition,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "attest":
      return handleAttest(request.params.arguments, clientConfig);
    case "get_posture":
      return handleGetPosture(request.params.arguments, clientConfig);
    case "check_gates":
      return handleCheckGates(request.params.arguments, clientConfig);
    case "derive_controls":
      return handleDeriveControls(request.params.arguments, clientConfig);
    case "register_system":
      return handleRegisterSystem(request.params.arguments, clientConfig);
    case "acknowledge_policy":
      return handleAcknowledgePolicy(request.params.arguments, clientConfig);
    case "list_systems":
      return handleListSystems(request.params.arguments, clientConfig);
    case "list_evidence":
      return handleListEvidence(request.params.arguments, clientConfig);
    case "dry_run_attest":
      return handleDryRunAttest(request.params.arguments, clientConfig);
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
