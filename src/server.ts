import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "./config/settings.js";
import { QualtricsClient } from "./services/qualtrics-client.js";
import { registerTools } from "./tools/index.js";

export async function createQualtricsServer() {
  const config = await loadConfig();
  const qualtricsClient = new QualtricsClient(config);

  const readOnlyInstructions = qualtricsClient.readOnly
    ? "This server is running in READ-ONLY mode (the safe default). All write, update, and delete operations are blocked. If the user asks to create, update, or delete something, let them know they are in read-only mode and offer to switch to read-write mode by calling set_read_only_mode. No environment variable changes are needed. IMPORTANT: Before disabling read-only mode, clearly warn the user that read-write mode allows operations that can permanently modify or delete surveys, contacts, and other Qualtrics data. Deleted Qualtrics data cannot be recovered. Ask the user to confirm they understand these risks before proceeding."
    : "This server is in READ-WRITE mode. Destructive tools (delete) require confirmDelete: true. The user can call set_read_only_mode to re-enable read-only mode at any time for safe exploration.";

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
      const message = args.enabled
        ? "Read-only mode enabled. Server is now in READ-ONLY mode. All write, update, and delete operations are blocked."
        : "⚠️ Read-only mode disabled. Server is now in READ-WRITE mode. Write, update, and delete operations are now permitted. Be aware that destructive actions (e.g., deleting surveys, contacts, or distributions) are IRREVERSIBLE — deleted Qualtrics data cannot be recovered. You can re-enable read-only mode at any time.";
      return {
        content: [{ type: "text", text: message }],
      };
    }
  );

  if (config.server.readOnly) {
    console.error("Qualtrics MCP Server running in READ-ONLY mode");
  }

  return server;
}
