# User Flows

## Flow 1: Source Ingestion
1. User navigates to project
2. Clicks "Add Source"
3. Chooses: Paste Notes / Paste Email / Upload File
4. For paste: selects type, enters content, saves
5. For file: selects file, uploads via presigned URL, confirms
6. Source appears in list with extraction status
7. For files: poll until extraction completes

## Flow 2: Pack Generation
1. User selects 1+ sources
2. Clicks "Generate Story Pack"
3. Optionally adds guidance notes, selects template
4. Waits 15-30s (loading state)
5. Redirects to pack editor

## Flow 3: Pack Editing
1. User views pack in three-panel editor
2. Clicks story/AC to edit inline
3. Auto-save after 500ms debounce
4. QA re-runs 2s after last edit
5. Can drag to reorder, add, delete

## Flow 4: Stakeholder Review
1. User clicks "Share for Review"
2. Gets shareable link (7-day expiry)
3. Stakeholder opens link (no auth)
4. Views read-only pack, adds comments
5. User sees comments in editor, resolves
6. User can revoke link

## Flow 5: Monday.com Push
1. User connects Monday.com in project settings
2. Selects board, group, field mapping
3. In pack editor: "Push to Monday.com"
4. Selects stories, confirms
5. Stories appear on board
