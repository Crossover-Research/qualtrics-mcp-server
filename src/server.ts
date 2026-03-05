import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "./config/settings.js";
import { QualtricsClient } from "./services/qualtrics-client.js";
import { registerTools } from "./tools/index.js";

export async function createQualtricsServer() {
  const config = await loadConfig();
  const qualtricsClient = new QualtricsClient(config);

  const readOnlyInstructions = qualtricsClient.readOnly
    ? "This server is running in READ-ONLY mode. All write, update, and delete operations are blocked. To enable writes, set QUALTRICS_READ_ONLY=false."
    : "This server can read AND write to Qualtrics. Destructive tools (delete) require confirmDelete: true. If the user wants safe exploration, they can call set_read_only_mode to enable read-only mode, or set QUALTRICS_READ_ONLY=true in the environment.";

  const server = new McpServer({
    name: "qualtrics-mcp-server",
    version: "1.0.0",
  }, {
    capabilities: {
      tools: {},
    },
    instructions: readOnlyInstructions,
  });

  // Register all domain tools
  await registerTools(server, qualtricsClient, config);

  // Register read-only mode toggle tool
  server.registerTool(
    "set_read_only_mode",
    {
      description: "Enable or disable read-only mode for this session. When enabled, all write/update/delete API calls are blocked. Useful for safe exploration.",
      annotations: { destructiveHint: false, idempotentHint: true },
      inputSchema: {
        enabled: z.boolean().describe("true to enable read-only mode, false to disable"),
      },
    },
    async (args) => {
      qualtricsClient.readOnly = args.enabled;
      const status = args.enabled ? "READ-ONLY" : "READ-WRITE";
      console.error(`Qualtrics MCP Server mode changed to ${status}`);
      return {
        content: [{ type: "text", text: `Read-only mode ${args.enabled ? "enabled" : "disabled"}. Server is now in ${status} mode.` }],
      };
    }
  );

  if (config.server.readOnly) {
    console.error("Qualtrics MCP Server running in READ-ONLY mode");
  }

  return server;
}
