# Zapier Integration

Reqvolt exposes a public ingest API that you can use with Zapier, Webhooks by Zapier, or any HTTP client to push content into projects.

## Overview

- **Endpoint**: `POST /api/v1/projects/{projectId}/sources/ingest`
- **Authentication**: Bearer token (workspace API key)
- **Rate limit**: 60 requests per hour per API key
- **Content**: Plain text or JSON with `text` and optional `name` fields

## Creating an API Key

1. Go to **Workspace Settings** in Reqvolt
2. In the **API keys** section, click **Create API key**
3. Give it a name (e.g. "Zapier")
4. **Copy the key immediately** — it is only shown once
5. Store it securely; you will use it as the Bearer token

Only workspace **Admins** can create or revoke API keys.

## Webhooks by Zapier Setup

### Trigger: Catch Hook

1. Create a new Zap
2. Choose **Webhooks by Zapier** as the trigger
3. Select **Catch Hook**
4. Copy the webhook URL Zapier provides
5. Use this URL in your other apps to send data to Zapier

### Action: POST to Reqvolt

1. Add an action step
2. Choose **Webhooks by Zapier**
3. Select **POST**
4. Configure:
   - **URL**: `https://your-reqvolt-domain.com/api/v1/projects/{projectId}/sources/ingest`
   - **Payload Type**: JSON
   - **Data**:
     ```json
     {
       "text": "{{trigger body or mapped field}}",
       "name": "Optional source name"
     }
     ```
   - **Headers**:
     - `Authorization`: `Bearer {{your API key}}`
     - `Content-Type`: `application/json`

### Example Zaps

#### Gmail → Reqvolt

1. **Trigger**: Gmail – New Email
2. **Filter**: Optional (e.g. only emails from a specific label)
3. **Action**: Webhooks by Zapier – POST
   - Map email body to `text`
   - Map email subject to `name`

#### Slack → Reqvolt

1. **Trigger**: Slack – New Message in Channel
2. **Action**: Webhooks by Zapier – POST
   - Map message text to `text`
   - Use channel name as `name`

#### Google Forms → Reqvolt

1. **Trigger**: Google Forms – New Form Response
2. **Action**: Webhooks by Zapier – POST
   - Map form fields to a combined `text` string
   - Use form title as `name`

## API Reference

### POST /api/v1/projects/{projectId}/sources/ingest

Creates a new source in the project and triggers chunking/embedding for RAG.

**Headers**

| Header          | Required | Description                    |
|-----------------|----------|--------------------------------|
| Authorization   | Yes      | `Bearer {api_key}`            |
| Content-Type    | Yes      | `application/json` or `text/plain` |

**Request body (JSON)**

| Field | Type   | Required | Description                          |
|-------|--------|----------|--------------------------------------|
| text  | string | Yes      | Content to ingest (min 10 characters)|
| name  | string | No       | Display name for the source (default: "Ingested") |

**Request body (text/plain)**

Raw text. The source will be named "Ingested".

**Responses**

- `201 Created`: `{ "sourceId": "...", "status": "created" }`
- `400 Bad Request`: Content too short or invalid
- `401 Unauthorized`: Invalid or missing API key
- `404 Not Found`: Project not found
- `429 Too Many Requests`: Rate limit exceeded
