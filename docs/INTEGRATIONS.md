# Monday.com Integration

## OAuth2 Flow
(Phase 3 - placeholder. Use API token for MVP.)

## GraphQL Queries
- listBoards
- listGroups
- listColumns
- createItem
- createSubitem
- updateColumnValues

## Field Mapping
- Story title > Item name
- Persona > Text
- Want > Long text
- So that > Long text
- ACs > Subitems OR long text (user choice)
- Evidence > Long text
- Story ID > Text

## Board/Group Selection
User selects board and group in project settings. Default mapping works without config.

## Error Handling
Rate limiting. One failure doesn't stop batch. Log to MondayPushLog.
