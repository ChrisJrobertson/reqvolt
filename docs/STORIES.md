# User Stories

## Epic 1: Source Ingestion
### S1.1 Paste Plain Text
**Persona**: Product Owner
**User Story**: As a PO, I want to paste plain text so that meeting notes become sources.
**Acceptance Criteria**: Types: MEETING_NOTES, CUSTOMER_FEEDBACK, WORKSHOP_NOTES, RETRO_NOTES, INTERVIEW_TRANSCRIPT, OTHER. Name derived from type + date.

### S1.2 Paste Email
**Persona**: Product Owner
**User Story**: As a PO, I want to paste email (subject + body) so that feedback is captured.
**Acceptance Criteria**: Subject and body stored separately in metadata.

### S1.3 File Upload (PDF/DOCX)
**Persona**: Product Owner
**User Story**: As a PO, I want to upload PDF/DOCX so that documents become sources.
**Acceptance Criteria**: Presigned PUT URL to R2. Max 50MB. Content types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document. Background extraction.

### S1.4 Source List
**Persona**: Product Owner
**User Story**: As a PO, I want to see sources listed with type icon, name/subject, date, snippet (150 chars).
**Acceptance Criteria**: Extraction quality badge. Sort by date desc.

### S1.5 Soft Delete
**Persona**: Product Owner
**User Story**: As a PO, I want to delete sources with confirmation.
**Acceptance Criteria**: Set deletedAt. Don't remove record. AuditLog.

### S1.7 File Extraction
**Persona**: System
**User Story**: PDF/DOCX extraction runs in background.
**Acceptance Criteria**: pdf-parse for PDF, mammoth for DOCX. extractionQuality: good (>100 chars), partial (10-100), failed (<10). Image-only PDF: status failed.

## Epic 2: Pack Generation
### S2.1 Generate Pack
**Persona**: Product Owner
**User Story**: As a PO, I want to generate a Story Pack from selected sources.
**Acceptance Criteria**: RAG retrieval, 5-layer prompt, JSON output, create Pack + PackVersion + Stories + ACs + EvidenceLinks.

### S2.5 Evidence Linking
**Persona**: System
**User Story**: Every story/AC links to source chunks.
**Acceptance Criteria**: EvidenceLink records. Confidence: high/medium/low.

### S2.7 Regenerate
**Persona**: Product Owner
**User Story**: As a PO, I want to regenerate with new sources/notes.
**Acceptance Criteria**: New PackVersion. Previous preserved. Version selector.

### S2.8-S2.9 Iterative Refresh
**Persona**: Product Owner
**User Story**: As a PO, I want to refresh pack when new sources exist.
**Acceptance Criteria**: 6-layer refresh prompt. changeAnalysis: storiesAdded, storiesModified, etc. Display in Changes tab.

## Epic 3: QA
### S3.1-S3.4 QA Rules
VAGUE_TERM, UNTESTABLE, OVERLOADED_AC, MISSING_CLAUSE. Deterministic, no LLM.

### S3.5-S3.6 QA Auto-Fix
**Persona**: Product Owner
**User Story**: As a PO, I want AI to suggest fixes for QA flags.
**Acceptance Criteria**: Side-by-side diff. Accept/Reject. QA re-runs after accept.

## Epic 4: Pack Editor
### S4.1-S4.2 Evidence Display
Evidence count badge. Unsupported amber badge on items without evidence.

### S4.3 Evidence Appendix
In DOCX export.

### S4.6 Evidence Evolution
evolutionStatus: new, strengthened, contradicted, unchanged, removed. Colour badges.

## Epic 5: Pack Editing
### S5.1-S5.4
Inline edit, 500ms debounce. Drag-and-drop reorder. Add/delete. QA re-runs 2s after edit.

## Epic 6: Versioning
### S6.1-S6.3
Create Version snapshot. Auto change summary. Lock (read-only). Optimistic locking.

## Epic 7: Stakeholder Review
### S7.1-S7.7
Share for Review (32-char token, 7-day expiry). Public /review/[token]. Comments. Revoke.

## Epic 8: Export
### S8.1-S8.2
DOCX export. Professional document with all sections.

## Epic 9: Auth & Workspaces
### S9.1 Clerk Sign-up
**Persona**: User
**User Story**: As a user, I sign up via magic link.
**Acceptance Criteria**: Auto-create personal Workspace on first sign-in.

### S9.2 Create Workspace
**Persona**: User
**User Story**: As a user, I create additional workspaces with a name.

### S9.3 Invite Members
**Persona**: Admin
**User Story**: As an admin, I invite members by email with role (Admin/Member).

### S9.4 Create Project
**Persona**: User
**User Story**: As a user, I create projects within workspace (name + optional client name).
