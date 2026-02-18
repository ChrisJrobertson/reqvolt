# REQVOLT — DATA PROCESSING AGREEMENT

This Data Processing Agreement ("DPA") forms part of the agreement between the Customer ("Data Controller") and SynqForge LTD trading as Reqvolt ("Data Processor") for the provision of the Reqvolt platform.

## 1. DEFINITIONS

- **Personal Data**: Any information relating to an identified or identifiable natural person, as defined in UK GDPR and EU GDPR.
- **Processing**: Any operation performed on Personal Data (collection, storage, use, disclosure, etc.).
- **Data Subject**: An identified or identifiable natural person to whom Personal Data relates.
- **Sub-processor**: Any third party engaged by the Data Processor to process Personal Data on behalf of the Data Controller.

## 2. SCOPE OF PROCESSING

Reqvolt processes Customer Data solely for the purpose of providing the Reqvolt requirements management platform. Processing activities include: source document storage, text extraction, AI-powered story generation, quality analysis, and export generation.

## 3. CUSTOMER DATA CATEGORIES

- Source documents (uploaded by Customer)
- Generated requirements (stories, acceptance criteria)
- User identity data (name, email via Clerk authentication)
- Workspace and project metadata

## 4. AI PROCESSING SPECIFICS

4.1 Source text chunks are transmitted to Anthropic's Claude API for story generation, quality review, and auto-fix processing.

4.2 Anthropic does not retain API inputs or outputs and does not use them for model training (per Anthropic Commercial API Terms).

4.3 Text embeddings are generated via OpenAI's API, which does not retain API inputs or use them for training.

4.4 The Customer may disable any or all AI processing features via Workspace Settings without affecting data storage.

## 5. SUB-PROCESSORS

| Service | Purpose | Data handled | Retention |
|---------|---------|---------|-----------|
| Anthropic | AI story generation | Source text chunks | None |
| OpenAI | Text embeddings | Source text chunks | None |
| Neon | Primary database | All workspace data | Until deletion |
| Cloudflare R2 | File storage | Uploaded documents | Until deletion |
| Clerk | Authentication | User identity | Until account deletion |
| Vercel | Application hosting | Request/response (transient) | Transient |
| Inngest | Background jobs | Job metadata | 7 days |
| Upstash Redis | Caching | Cached queries | TTL-based |

The Processor shall notify the Controller of any changes to sub-processors at least 30 days in advance.

## 6. DATA SECURITY

- All data encrypted in transit (TLS 1.3)
- Database encryption at rest (Neon managed encryption)
- File storage encryption at rest (Cloudflare R2 managed encryption)
- Authentication via Clerk with optional SSO
- Role-based access control within workspaces

## 7. DATA SUBJECT RIGHTS

The Processor supports the Controller in fulfilling data subject requests (access, rectification, erasure, portability). Data export and deletion tools are available in Workspace Settings.

## 8. DATA RETENTION

- Customer Data is retained for the duration of the subscription
- On termination: Customer Data is deleted within 30 days
- The Customer may request immediate data deletion at any time

## 9. DATA BREACH NOTIFICATION

The Processor shall notify the Controller without undue delay (and in any event within 72 hours) upon becoming aware of a personal data breach.

## 10. AUDIT RIGHTS

The Controller may audit the Processor's compliance with this DPA upon reasonable notice (minimum 30 days). The Processor shall make available the AI Processing Log (Workspace Settings → Data & AI Processing) as evidence of processing activities.

## 11. GOVERNING LAW

This DPA is governed by the laws of England and Wales.

---

**SIGNATURES**

[Customer Name, Title, Date]

[SynqForge LTD, Director, Date]
