# Qualtrics MCP Server

A Model Context Protocol (MCP) server that gives Claude full control over the Qualtrics platform. Build surveys, manage questions, configure logic flows, distribute via email, handle contacts, export responses, and more — all through natural language.

## What Can It Do?

**53 tools** across 8 domains covering the entire Qualtrics API surface:

| Domain | Tools | Capabilities |
|--------|-------|-------------|
| **Surveys** | 8 | Create, list, get, update, delete, activate, deactivate, estimate export size |
| **Questions** | 7 | Full CRUD + simplified helpers for multiple choice, text entry, and matrix/Likert |
| **Blocks** | 4 | Create, list, update, delete survey blocks |
| **Survey Flow** | 7 | Get/update flow, add embedded data, add web services, list fields, piped text reference |
| **Responses** | 7 | Export (with smart filtering + auto-save), get/create/update/delete individual responses |
| **Contacts** | 7 | Mailing lists CRUD, individual + bulk contact import, update, remove |
| **Distributions** | 5 | Email distributions, anonymous links, reminders, list, delete |
| **Webhooks** | 3 | Event subscriptions for survey lifecycle events |
| **Users** | 2 | List organization users, get user details |

### Survey Management
- `list_surveys` — List surveys with filtering and pagination
- `get_survey` — Get survey details, optionally with full definition
- `create_survey` — Create a new survey
- `update_survey` — Update name, status, expiration
- `delete_survey` — Delete with name confirmation safety check
- `activate_survey` / `deactivate_survey` — Toggle collection
- `estimate_export_size` — Preview data size before downloading

### Question Management
- `list_questions` — List all questions with types and previews
- `get_question` — Get full question definition
- `create_question` — Create with full Qualtrics spec (any type/selector)
- `update_question` — Modify text, choices, validation
- `delete_question` — Remove a question
- `add_multiple_choice_question` — Simplified MC creation from a list of choice strings
- `add_text_entry_question` — Simplified TE creation (single/multi/essay)
- `add_matrix_question` — Simplified Likert/matrix with statements + scale points

### Block Management
- `list_blocks` / `create_block` / `update_block` / `delete_block`

### Survey Flow & Logic
- `get_survey_flow` — Full flow tree (blocks, randomizers, branches, embedded data, web services)
- `update_survey_flow` — Replace the entire flow
- `add_embedded_data` — Inject embedded data fields into the flow
- `add_web_service` — Call external APIs mid-survey with response-to-field mapping
- `list_embedded_data` — List all declared embedded data fields
- `list_web_services` — List all web service elements
- `piped_text_reference` — Look up `${e://Field/...}`, `${q://QID.../...}`, etc. syntax

### Response Export & Data
- `export_responses` — Export all responses (auto-saves large files to Downloads)
- `export_responses_filtered` — Export with date ranges, completion filters, question selection
- `check_export_status` — Poll an in-progress export job
- `get_response` / `create_response` / `update_response` / `delete_response`

### Contacts & Mailing Lists
- `list_mailing_lists` / `create_mailing_list` / `delete_mailing_list`
- `list_contacts` — Paginated contact list
- `add_contact` / `update_contact` / `remove_contact`
- `bulk_import_contacts` — Import multiple contacts at once

### Distributions
- `list_distributions` / `get_distribution` / `delete_distribution`
- `create_anonymous_link` — Generate a shareable survey URL
- `create_email_distribution` — Send survey invitations to a mailing list
- `create_reminder` — Send follow-up reminders for existing distributions

### Webhooks
- `list_webhooks` / `create_webhook` / `delete_webhook`
- Subscribe to events like `completedResponse.{surveyId}`, `controlpanel.activateSurvey`, etc.

### Users
- `list_users` / `get_user`

### Server Control
- `set_read_only_mode` — Toggle read-only mode at runtime (blocks all write/update/delete operations)

## Setup

### Prerequisites

- Node.js 22+
- Qualtrics API token with appropriate permissions
- Qualtrics data center ID

### Installation

```bash
git clone https://github.com/yrvelez/qualtrics-mcp-server.git
cd qualtrics-mcp-server
pnpm install
```

Configure environment variables:

```bash
cp .env.example .env
# Edit .env with your Qualtrics credentials
```

### Configuration

Set these in your `.env` file:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QUALTRICS_API_TOKEN` | Yes | — | Your Qualtrics API token |
| `QUALTRICS_DATA_CENTER` | Yes | — | Data center ID (e.g., `yul1`) |
| `QUALTRICS_BASE_URL` | No | Auto-generated | Custom base URL override |
| `QUALTRICS_READ_ONLY` | No | `false` | Block all write/delete operations (safe exploration mode) |
| `RATE_LIMITING_ENABLED` | No | `true` | Enable/disable rate limiting |
| `RATE_LIMIT_RPM` | No | `50` | Requests per minute |
| `REQUEST_TIMEOUT` | No | `30000` | Request timeout in ms |

### Read-Only Mode

Set `QUALTRICS_READ_ONLY=true` to block all write, update, and delete operations. This is useful for safely exploring surveys and exporting data without risk of accidental changes. You can also toggle this at runtime using the `set_read_only_mode` tool.

### Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qualtrics": {
      "command": "npx",
      "args": ["tsx", "/path/to/qualtrics-mcp-server/src/index.ts"],
      "env": {
        "QUALTRICS_API_TOKEN": "your_api_token",
        "QUALTRICS_DATA_CENTER": "your_data_center_id"
      }
    }
  }
}
```

## Usage Examples

Once configured, ask Claude things like:

**Survey building:**
- "Create a survey called 'Customer Satisfaction Q1 2026'"
- "Add a 5-point Likert matrix question measuring service quality"
- "Set up a randomizer that splits participants into two conditions"
- "Add embedded data fields for condition assignment and participant ID"

**Data collection:**
- "Create a mailing list and import these 50 contacts"
- "Send the survey to my research participants mailing list"
- "Generate an anonymous link for the pre-screen survey"
- "Send a reminder to everyone who hasn't responded yet"

**Data export:**
- "Export all complete responses from the last 30 days as CSV"
- "How many responses does my survey have? Estimate the export size"
- "Download responses for questions QID1-QID5 only"

**Flow & logic:**
- "Show me the current survey flow"
- "Add a web service call to my API that sets the stimulus condition"
- "What piped text syntax do I use to reference embedded data?"

## Architecture

```
src/
  config/settings.ts          — Environment config with Zod validation
  services/
    qualtrics-client.ts       — HTTP client with auth, rate limiting, read-only enforcement
    survey-api.ts             — Survey + question + block CRUD
    flow-api.ts               — Survey flow management
    response-api.ts           — Response export + individual response CRUD
    contact-api.ts            — Mailing list + contact management
    distribution-api.ts       — Email distributions + anonymous links
    user-api.ts               — Organization user lookups
    webhook-api.ts            — Event subscription management
  tools/
    survey-tools.ts           — Survey MCP tool definitions
    question-tools.ts         — Question MCP tools (raw + simplified helpers)
    block-tools.ts            — Block MCP tools
    flow-tools.ts             — Flow, embedded data, web service, piped text tools
    response-tools.ts         — Export + individual response tools
    contact-tools.ts          — Mailing list + contact tools
    distribution-tools.ts     — Distribution tools
    user-tools.ts             — User tools
    webhook-tools.ts          — Webhook tools
    _helpers.ts               — Shared tool result helpers
    index.ts                  — Tool registry
  types/                      — TypeScript type definitions
  utils/                      — File saving utilities
```

## Development

```bash
pnpm start          # Run the server
pnpm dev             # Run with file watching
pnpm typecheck       # Type check with tsgo
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `"Unexpected token 'Q'"` | Ensure no `console.log` statements interfere with MCP JSON protocol |
| `"Read-only file system"` | Use absolute paths or let auto-save write to Downloads |
| Large file timeouts | Use `export_responses_filtered` with date ranges and `questionIds` |
| Rate limit errors | Built-in rate limiting handles this automatically; reduce `RATE_LIMIT_RPM` if needed |

## License

MIT
