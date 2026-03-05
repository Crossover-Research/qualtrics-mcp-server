import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QualtricsClient } from "../services/qualtrics-client.js";
import { DistributionApi } from "../services/distribution-api.js";
import { QualtricsConfig } from "../config/settings.js";
import { toolSuccess, withErrorHandling, requireDeleteConfirmation } from "./_helpers.js";

export function registerDistributionTools(
  server: McpServer,
  client: QualtricsClient,
  config: QualtricsConfig
) {
  const distributionApi = new DistributionApi(client);

  // List distributions
  server.registerTool(
    "list_distributions",
    {
      description: "List all distributions for a survey (email sends, anonymous links, etc.)",
      annotations: { readOnlyHint: true },
      inputSchema: {
        surveyId: z.string().min(1).describe("The Qualtrics survey ID"),
      },
    },
    withErrorHandling("list_distributions", async (args) => {
      const result = await distributionApi.listDistributions(args.surveyId);
      const distributions = result.result.elements || [];

      return toolSuccess({
        surveyId: args.surveyId,
        distributions: distributions.map((d: any) => ({
          id: d.id,
          requestType: d.requestType,
          requestStatus: d.requestStatus,
          sendDate: d.sendDate,
          createdDate: d.createdDate,
          stats: d.stats,
        })),
        total: distributions.length,
      });
    })
  );

  // Get distribution
  server.registerTool(
    "get_distribution",
    {
      description: "Get detailed information about a specific distribution including delivery stats",
      annotations: { readOnlyHint: true },
      inputSchema: {
        distributionId: z.string().min(1).describe("The distribution ID"),
        surveyId: z.string().min(1).describe("The Qualtrics survey ID"),
      },
    },
    withErrorHandling("get_distribution", async (args) => {
      const result = await distributionApi.getDistribution(args.distributionId, args.surveyId);
      return toolSuccess({
        distribution: result.result,
      });
    })
  );

  // Create anonymous link
  server.registerTool(
    "create_anonymous_link",
    {
      description: "Generate an anonymous survey link for distribution",
      annotations: { destructiveHint: false },
      inputSchema: {
        surveyId: z.string().min(1).describe("The Qualtrics survey ID"),
        description: z.string().min(1).describe("Description for this distribution link"),
        expirationDate: z.string().optional().describe("Link expiration date (ISO format: YYYY-MM-DDTHH:MM:SSZ)"),
      },
    },
    withErrorHandling("create_anonymous_link", async (args) => {
      const data: Record<string, any> = {
        surveyId: args.surveyId,
        linkType: "Anonymous",
        description: args.description,
        action: "CreateDistribution",
      };
      if (args.expirationDate) {
        data.expirationDate = args.expirationDate;
      }

      const result = await distributionApi.createDistribution(data);
      return toolSuccess({
        success: true,
        surveyId: args.surveyId,
        distributionId: result.result.id,
        anonymousUrl: result.result.surveyLink?.url || null,
        message: "Anonymous link created successfully",
        details: result.result,
      });
    })
  );

  // Create email distribution
  server.registerTool(
    "create_email_distribution",
    {
      description: "Send a survey via email to a mailing list",
      annotations: { destructiveHint: false },
      inputSchema: {
        surveyId: z.string().min(1).describe("The Qualtrics survey ID"),
        mailingListId: z.string().min(1).describe("The mailing list ID to send to"),
        fromName: z.string().min(1).describe("From name displayed in the email"),
        replyToEmail: z.string().min(1).describe("Reply-to email address"),
        subject: z.string().min(1).describe("Email subject line"),
        messageId: z.string().min(1).describe("ID of the message template from the library"),
        libraryId: z.string().min(1).describe("ID of the library containing the message template"),
        sendDate: z.string().optional().describe("Scheduled send date (ISO format). If omitted, sends immediately."),
      },
    },
    withErrorHandling("create_email_distribution", async (args) => {
      const data: Record<string, any> = {
        surveyId: args.surveyId,
        linkType: "Individual",
        description: `Email distribution for ${args.surveyId}`,
        action: "CreateDistribution",
        recipients: {
          mailingListId: args.mailingListId,
        },
        header: {
          fromName: args.fromName,
          replyToEmail: args.replyToEmail,
          subject: args.subject,
        },
        message: {
          libraryId: args.libraryId,
          messageId: args.messageId,
        },
      };
      if (args.sendDate) {
        data.sendDate = args.sendDate;
      }

      const result = await distributionApi.createDistribution(data);
      return toolSuccess({
        success: true,
        surveyId: args.surveyId,
        distributionId: result.result.id,
        message: args.sendDate
          ? `Email distribution scheduled for ${args.sendDate}`
          : "Email distribution created and sending",
        details: result.result,
      });
    })
  );

  // Delete distribution
  server.registerTool(
    "delete_distribution",
    {
      description: "Delete a distribution",
      annotations: { destructiveHint: true },
      inputSchema: {
        distributionId: z.string().min(1).describe("The distribution ID to delete"),
        confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
      },
    },
    withErrorHandling("delete_distribution", async (args) => {
      const guard = requireDeleteConfirmation(args);
      if (guard) return guard;
      const result = await distributionApi.deleteDistribution(args.distributionId);
      return toolSuccess({
        success: true,
        distributionId: args.distributionId,
        message: "Distribution deleted successfully",
        details: result.result,
      });
    })
  );

  // Create reminder
  server.registerTool(
    "create_reminder",
    {
      description: "Send a reminder for an existing email distribution",
      annotations: { destructiveHint: false },
      inputSchema: {
        distributionId: z.string().min(1).describe("The parent distribution ID to send a reminder for"),
        fromName: z.string().min(1).describe("From name displayed in the reminder email"),
        replyToEmail: z.string().min(1).describe("Reply-to email address"),
        subject: z.string().min(1).describe("Reminder email subject line"),
        messageId: z.string().min(1).describe("ID of the reminder message template"),
        libraryId: z.string().min(1).describe("ID of the library containing the message template"),
        sendDate: z.string().optional().describe("Scheduled send date (ISO format). If omitted, sends immediately."),
      },
    },
    withErrorHandling("create_reminder", async (args) => {
      const data: Record<string, any> = {
        header: {
          fromName: args.fromName,
          replyToEmail: args.replyToEmail,
          subject: args.subject,
        },
        message: {
          libraryId: args.libraryId,
          messageId: args.messageId,
        },
      };
      if (args.sendDate) {
        data.sendDate = args.sendDate;
      }

      const result = await distributionApi.createReminder(args.distributionId, data);
      return toolSuccess({
        success: true,
        parentDistributionId: args.distributionId,
        reminderId: result.result.id,
        message: args.sendDate
          ? `Reminder scheduled for ${args.sendDate}`
          : "Reminder created and sending",
        details: result.result,
      });
    })
  );
}
