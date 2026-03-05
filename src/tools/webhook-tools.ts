import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QualtricsClient } from "../services/qualtrics-client.js";
import { WebhookApi } from "../services/webhook-api.js";
import { QualtricsConfig } from "../config/settings.js";
import { toolSuccess, withErrorHandling, requireDeleteConfirmation } from "./_helpers.js";

export function registerWebhookTools(
  server: McpServer,
  client: QualtricsClient,
  config: QualtricsConfig
) {
  const webhookApi = new WebhookApi(client);

  // List webhooks
  server.registerTool(
    "list_webhooks",
    {
      description: "List all event subscriptions (webhooks) in your Qualtrics account",
      annotations: { readOnlyHint: true },
    },
    withErrorHandling("list_webhooks", async () => {
      const result = await webhookApi.listWebhooks();
      const subscriptions = result.result.elements || [];

      return toolSuccess({
        webhooks: subscriptions.map((s: any) => ({
          id: s.id,
          topics: s.topics,
          publicationUrl: s.publicationUrl,
          encrypted: s.encrypted,
          scope: s.scope,
          successfulPublications: s.successfulPublications,
        })),
        total: subscriptions.length,
      });
    })
  );

  // Create webhook
  server.registerTool(
    "create_webhook",
    {
      description: "Create an event subscription (webhook) to receive notifications for Qualtrics events",
      annotations: { destructiveHint: false },
      inputSchema: {
        topics: z.string().min(1).describe("Event topic to subscribe to (e.g., 'controlpanel.activateSurvey', 'completedResponse.{surveyId}')"),
        publicationUrl: z.string().min(1).describe("URL to receive webhook notifications"),
        encrypted: z.boolean().optional().describe("Whether to encrypt the webhook payload (default: false)"),
      },
    },
    withErrorHandling("create_webhook", async (args) => {
      const data: Record<string, any> = {
        topics: args.topics,
        publicationUrl: args.publicationUrl,
        encrypt: args.encrypted ?? false,
      };

      const result = await webhookApi.createWebhook(data);
      return toolSuccess({
        success: true,
        subscriptionId: result.result.id,
        message: "Webhook created successfully",
        details: result.result,
      });
    })
  );

  // Delete webhook
  server.registerTool(
    "delete_webhook",
    {
      description: "Delete an event subscription (webhook)",
      annotations: { destructiveHint: true },
      inputSchema: {
        subscriptionId: z.string().min(1).describe("The subscription ID to delete"),
        confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
      },
    },
    withErrorHandling("delete_webhook", async (args) => {
      const guard = requireDeleteConfirmation(args);
      if (guard) return guard;
      const result = await webhookApi.deleteWebhook(args.subscriptionId);
      return toolSuccess({
        success: true,
        subscriptionId: args.subscriptionId,
        message: "Webhook deleted successfully",
        details: result.result,
      });
    })
  );
}
