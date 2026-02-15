# Prompt Strategy

## 15.1 Generation Prompt - 5 Layers
L1: System - agile delivery expert, output JSON format, evidence rules, UK English
L2: Template context (if selected)
L3: Glossary injection (if exists)
L4: Source evidence - RAG-retrieved chunks
L5: User notes

## 15.2 Evidence Rules
- Every story must have at least one evidence link
- Every AC must have at least one evidence link
- Confidence: high (direct quote), medium (paraphrase), low (inference)
- Mark items without evidence as "unsupported"

## 15.3 Few-Shot Examples
Include 2-3 complete story+AC examples in prompt. GWT format for ACs.

## 15.5 RAG Pipeline
- Chunking: @langchain/textsplitters, 512 tokens, 50 overlap
- Embedding: OpenAI text-embedding-3-small
- Retrieval: top-K cosine similarity (top 20 for generation)

## 15.6 QA Rewrite Prompt
Takes flagged AC + rule code. Returns improved version. Side-by-side diff.

## 15.7 QA Rules (Deterministic)
- VAGUE_TERM: fast, easy, seamless, optimise, efficient, user-friendly
- UNTESTABLE: should, as needed, etc., when appropriate, if necessary
- OVERLOADED_AC: multiple AND or THEN > 50 words
- MISSING_CLAUSE: GWT missing Given, When, or Then

## 15.8 Refresh Prompt - 6 Layers
L1: System + refresh rules
L2: Previous pack
L3: Source delta (mark NEW sources)
L4: Refresh instructions
L5: ALL chunks (new tagged [NEW])
L6: User notes

## Change Analysis Output
changeAnalysis JSONB: storiesAdded, storiesModified, assumptionsResolved, newAssumptions, newOpenQuestions, evidenceEvolution
