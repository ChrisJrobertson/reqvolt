# Data Model

## Entity Relationship Overview

21 tables: Workspace, WorkspaceMember, Project, Source, SourceChunk, Pack, PackVersion, Story, AcceptanceCriteria, EvidenceLink, QAFlag, ReviewLink, ReviewComment, AuditLog, Template, GlossaryEntry, GenerationCache, StoryApproval, MondayConnection, MondayPushLog, UploadSession

## Tables

### Workspace
- id (uuid, PK)
- name (string)
- createdAt, updatedAt

### WorkspaceMember
- id (uuid, PK)
- workspaceId (FK)
- userId (Clerk user ID)
- role (enum: Admin, Member)
- email (string)
- invitedAt, joinedAt

### Project
- id (uuid, PK)
- workspaceId (FK)
- name (string)
- clientName (string, optional)
- createdAt, updatedAt

### Source
- id (uuid, PK)
- projectId (FK)
- workspaceId (FK)
- type (enum: MEETING_NOTES, CUSTOMER_FEEDBACK, WORKSHOP_NOTES, RETRO_NOTES, INTERVIEW_TRANSCRIPT, EMAIL, PDF, DOCX, OTHER)
- name (string) - for text/email: derived; for files: filename
- content (text) - extracted text
- metadata (JSONB) - for email: subject, body; for files: objectKey, extractionQuality
- extractionQuality (enum: good, partial, failed) - for file sources
- status (enum: pending, processing, completed, failed)
- deletedAt (datetime, nullable)
- createdAt, updatedAt

### SourceChunk
- id (uuid, PK)
- sourceId (FK)
- content (text)
- tokenCount (int)
- chunkIndex (int)
- embedding (vector(1536)) - pgvector

### Pack
- id (uuid, PK)
- projectId (FK)
- workspaceId (FK)
- name (string)
- createdAt, updatedAt

### PackVersion
- id (uuid, PK)
- packId (FK)
- versionNumber (int)
- sourceIds (JSONB array)
- summary (text)
- nonGoals (text)
- openQuestions (JSONB)
- assumptions (JSONB)
- decisions (JSONB)
- risks (JSONB)
- generationConfig (JSONB)
- changeAnalysis (JSONB) - for refresh: storiesAdded, storiesModified, etc.
- editLockUserId (string, nullable)
- createdAt, updatedAt

### Story
- id (uuid, PK)
- packVersionId (FK)
- sortOrder (int)
- persona (string)
- want (string)
- soThat (string)
- deletedAt (datetime, nullable)
- createdAt, updatedAt

### AcceptanceCriteria
- id (uuid, PK)
- storyId (FK)
- sortOrder (int)
- given (string)
- when (string)
- then (string)
- deletedAt (datetime, nullable)
- createdAt, updatedAt

### EvidenceLink
- id (uuid, PK)
- entityType (enum: story, acceptance_criteria)
- entityId (uuid)
- sourceChunkId (FK)
- confidence (enum: high, medium, low)
- evolutionStatus (enum: new, strengthened, contradicted, unchanged, removed)
- previousConfidence (string, nullable)
- createdAt, updatedAt

### QAFlag
- id (uuid, PK)
- packVersionId (FK)
- entityType (enum: story, acceptance_criteria)
- entityId (uuid)
- ruleCode (string) - VAGUE_TERM, UNTESTABLE, OVERLOADED_AC, MISSING_CLAUSE
- severity (enum: high, medium, low)
- message (string)
- suggestedFix (text, nullable)
- resolvedBy (enum: fixed, dismissed, nullable)
- createdAt, updatedAt

### ReviewLink
- id (uuid, PK)
- packVersionId (FK)
- token (string, 32-char crypto)
- expiresAt (datetime)
- revokedAt (datetime, nullable)
- viewCount (int)
- lastViewedAt (datetime, nullable)
- createdAt

### ReviewComment
- id (uuid, PK)
- reviewLinkId (FK)
- entityType (enum: story, acceptance_criteria)
- entityId (uuid)
- content (text)
- resolvedAt (datetime, nullable)
- createdAt

### AuditLog
- id (uuid, PK)
- workspaceId (FK)
- userId (string)
- action (string)
- entityType (string)
- entityId (uuid)
- metadata (JSONB)
- createdAt

### Template
- id (uuid, PK)
- workspaceId (FK)
- name (string)
- content (JSONB)
- createdAt, updatedAt

### GlossaryEntry
- id (uuid, PK)
- workspaceId (FK)
- term (string)
- definition (string)
- createdAt, updatedAt

### GenerationCache
- id (uuid, PK)
- cacheKey (string, unique)
- response (JSONB)
- expiresAt (datetime)
- createdAt

### StoryApproval
- id (uuid, PK)
- storyId (FK)
- approvedBy (string)
- approvedAt (datetime)
- status (enum: approved, rejected)

### UploadSession
- id (uuid, PK)
- workspaceId (FK)
- userId (string)
- objectKey (string)
- expectedSize (bigint)
- expectedContentType (string)
- expiresAt (datetime) - 5 min from creation
- consumedAt (datetime, nullable)
- createdAt

### MondayConnection
- id (uuid, PK)
- workspaceId (FK)
- mondayBoardId (string)
- mondayGroupId (string)
- fieldMapping (JSONB)
- accessToken (string, encrypted)
- refreshToken (string, nullable)
- connectedAt (datetime)
- connectedBy (string)

### MondayPushLog
- id (uuid, PK)
- packVersionId (FK)
- storyId (FK)
- mondayItemId (string)
- pushedAt (datetime)
- pushedBy (string)
- status (enum: success, failed, skipped)
- errorMessage (text, nullable)
