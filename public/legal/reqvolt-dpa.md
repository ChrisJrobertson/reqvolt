# REQVOLT — DATA PROCESSING AGREEMENT

This Data Processing Agreement ("DPA") forms part of the agreement between
the Customer ("Data Controller") and SynqForge LTD trading as Reqvolt
("Data Processor") for the provision of the Reqvolt platform.

## 1. DEFINITIONS

- Personal Data, Processing, Data Subject, and Sub-processor have the meanings
  given in UK GDPR and EU GDPR.

## 2. SCOPE OF PROCESSING

- Reqvolt processes Customer Data solely for providing the Reqvolt requirements
  management platform.
- Processing activities include source document storage, text extraction,
  AI-powered story generation, quality analysis, and export generation.

## 3. CUSTOMER DATA CATEGORIES

- Source documents uploaded by the Customer
- Generated requirements (stories and acceptance criteria)
- User identity data (name and email via Clerk authentication)
- Workspace and project metadata

## 4. AI PROCESSING SPECIFICS

### 4.1

Source text chunks are transmitted to Anthropic's Claude API for story
generation, quality review, and auto-fix processing.

### 4.2

Anthropic does not retain API inputs or outputs and does not use them for model
training under Anthropic Commercial API terms.

### 4.3

Text embeddings are generated via OpenAI API, which does not retain API inputs
or use them for model training.

### 4.4

The Customer may disable any or all AI processing features via Workspace
Settings without affecting data storage.

## 5. SUB-PROCESSORS

| Service | Purpose | Data handled | Retention | Region | Link |
|---|---|---|---|---|---|
| Anthropic (Claude) | AI generation and review | Source text chunks | None (commercial API) | US | https://docs.anthropic.com/en/docs/about-claude/pricing#data-retention |
| OpenAI | Embeddings | Source text chunks | None (API policy) | US | https://openai.com/policies/api-data-usage-policies |
| Neon | Primary database | Workspace data | Until deletion | Configurable | https://neon.tech/docs/security/security-overview |
| Cloudflare R2 | File storage | Uploaded files and exports | Until deletion | Configurable | https://www.cloudflare.com/trust-hub/privacy-and-data-protection/ |
| Clerk | Authentication | User identity | Until deletion | US | https://clerk.com/legal/privacy |
| Vercel | Hosting | Request metadata | Transient | Global | https://vercel.com/legal/privacy-policy |
| Inngest | Background jobs | Job metadata and payloads | 7 days | US | https://www.inngest.com/privacy |
| Upstash Redis | Caching | Cached queries and counters | TTL based | Configurable | https://upstash.com/privacy |
| Sentry | Error monitoring | Error telemetry | 30 days | US | https://sentry.io/privacy/ |
| Resend | Email delivery | Email metadata/content transit | Transient | US | https://resend.com/legal/privacy-policy |

The Processor shall notify the Controller of any material sub-processor changes
at least 30 days in advance.

## 6. DATA SECURITY

- Encryption in transit (TLS 1.3)
- Encryption at rest in Neon PostgreSQL
- Encryption at rest in Cloudflare R2
- Authentication via Clerk with optional SSO
- Role-based access control within workspaces

## 7. DATA SUBJECT RIGHTS

- The Processor supports the Controller with access, rectification, erasure,
  and portability requests.
- Data export and deletion tools are available through workspace settings.

## 8. DATA RETENTION

- Customer Data is retained for the duration of the subscription.
- On termination, Customer Data is deleted within 30 days unless otherwise
  required by law.
- Customers may request immediate deletion at any time.

## 9. DATA BREACH NOTIFICATION

The Processor shall notify the Controller without undue delay and no later than
72 hours after becoming aware of a personal data breach.

## 10. AUDIT RIGHTS

- The Controller may audit Processor compliance with reasonable notice
  (minimum 30 days).
- The Processor will provide the AI Processing Log from workspace settings as
  evidence of AI processing activities.

## 11. GOVERNING LAW

This DPA is governed by the laws of England and Wales.

## SIGNATURES

- Customer Name, Title, Date
- SynqForge LTD, Director, Date
