# SendGrid Inbound Parse Setup

## Prerequisites

- SendGrid account with Inbound Parse enabled
- Domain DNS access for your ingest subdomain

## DNS Configuration

Add an MX record for your ingest subdomain:

| Type | Host | Value | Priority |
|------|------|-------|----------|
| MX | ingest.reqvolt.com | mx.sendgrid.net | 10 |

## SendGrid Configuration

1. Go to **Settings → Inbound Parse** in the SendGrid dashboard
2. Add host: `ingest.reqvolt.com`
3. Set URL: `https://app.reqvolt.com/api/webhooks/inbound-email`
4. Enable **POST the raw, full MIME message** — OFF (we want parsed)
5. Enable **Check incoming emails for spam** — ON
6. Save

## Webhook Signature Verification

Set the `SENDGRID_WEBHOOK_SECRET` environment variable to your SendGrid webhook signing secret. The webhook handler validates signatures when this variable is set.

## Testing

1. Set `INBOUND_EMAIL_DOMAIN=ingest.reqvolt.com` in your Vercel env vars
2. Create a project — it will get a forwarding address like `q4-platform-abc123@ingest.reqvolt.com`
3. Send an email to that address from a workspace member's email
4. Check Inngest dashboard for `email/inbound.received` event
5. Verify source appears in the project

## Local Development

For local testing, use ngrok or similar to expose your local webhook:

```bash
ngrok http 3000
```

Then set the ngrok URL as the SendGrid inbound parse destination temporarily. Update `INBOUND_EMAIL_DOMAIN` to match your test domain.
