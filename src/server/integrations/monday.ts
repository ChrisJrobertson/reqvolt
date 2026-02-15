/**
 * Monday.com GraphQL API client (API token MVP).
 * https://developer.monday.com/api-reference
 */
const MONDAY_API = "https://api.monday.com/v2";

export interface MondayBoard {
  id: string;
  name: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

export interface FieldMapping {
  personaColumnId?: string;
  wantColumnId?: string;
  soThatColumnId?: string;
  evidenceColumnId?: string;
  storyIdColumnId?: string;
}

async function mondayRequest<T>(
  apiToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (!res.ok) {
    throw new Error(json.errors?.[0]?.message ?? `Monday.com API error: ${res.status}`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors[0]!.message);
  }
  if (!json.data) {
    throw new Error("No data from Monday.com API");
  }
  return json.data;
}

export async function listBoards(apiToken: string): Promise<MondayBoard[]> {
  const data = await mondayRequest<{
    boards: Array<{ id: string; name: string }>;
  }>(
    apiToken,
    `query {
      boards(limit: 50) {
        id
        name
      }
    }`
  );
  return data.boards.map((b) => ({ id: b.id, name: b.name }));
}

export async function listGroups(
  apiToken: string,
  boardId: string
): Promise<MondayGroup[]> {
  const data = await mondayRequest<{
    boards: Array<{
      groups: Array<{ id: string; title: string }>;
    }>;
  }>(
    apiToken,
    `query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        groups {
          id
          title
        }
      }
    }`,
    { boardId }
  );
  const board = data.boards[0];
  return board?.groups ?? [];
}

export async function listColumns(
  apiToken: string,
  boardId: string
): Promise<MondayColumn[]> {
  const data = await mondayRequest<{
    boards: Array<{
      columns: Array<{ id: string; title: string; type: string }>;
    }>;
  }>(
    apiToken,
    `query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        columns {
          id
          title
          type
        }
      }
    }`,
    { boardId }
  );
  const board = data.boards[0];
  return board?.columns ?? [];
}

function buildColumnValues(
  mapping: FieldMapping,
  values: {
    persona: string;
    want: string;
    soThat: string;
    evidence: string;
    storyId: string;
  }
): Record<string, string> {
  const cv: Record<string, string> = {};
  if (mapping.personaColumnId && values.persona) {
    cv[mapping.personaColumnId] = values.persona;
  }
  if (mapping.wantColumnId && values.want) {
    cv[mapping.wantColumnId] = values.want;
  }
  if (mapping.soThatColumnId && values.soThat) {
    cv[mapping.soThatColumnId] = values.soThat;
  }
  if (mapping.evidenceColumnId && values.evidence) {
    cv[mapping.evidenceColumnId] = values.evidence;
  }
  if (mapping.storyIdColumnId && values.storyId) {
    cv[mapping.storyIdColumnId] = values.storyId;
  }
  return cv;
}

export function buildStoryTitle(persona: string, want: string, soThat: string): string {
  const full = `As a ${persona}, I want ${want} so that ${soThat}`;
  return full.length > 80 ? full.slice(0, 77) + "..." : full;
}

export async function createItem(
  apiToken: string,
  boardId: string,
  groupId: string,
  itemName: string,
  columnValues?: Record<string, string>
): Promise<string> {
  const columnValuesJson = columnValues && Object.keys(columnValues).length > 0
    ? JSON.stringify(columnValues)
    : undefined;
  const data = await mondayRequest<{
    create_item: { id: string };
  }>(
    apiToken,
    `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON) {
      create_item (
        board_id: $boardId,
        group_id: $groupId,
        item_name: $itemName,
        column_values: $columnValues
      ) {
        id
      }
    }`,
    {
      boardId: String(boardId),
      groupId,
      itemName,
      columnValues: columnValuesJson,
    }
  );
  return data.create_item.id;
}

export async function createSubitem(
  apiToken: string,
  parentItemId: string,
  itemName: string,
  columnValues?: Record<string, string>
): Promise<string> {
  const columnValuesJson = columnValues && Object.keys(columnValues).length > 0
    ? JSON.stringify(columnValues)
    : undefined;
  const data = await mondayRequest<{
    create_subitem: { id: string };
  }>(
    apiToken,
    `mutation ($parentItemId: ID!, $itemName: String!, $columnValues: JSON) {
      create_subitem (
        parent_item_id: $parentItemId,
        item_name: $itemName,
        column_values: $columnValues
      ) {
        id
      }
    }`,
    {
      parentItemId,
      itemName,
      columnValues: columnValuesJson,
    }
  );
  return data.create_subitem.id;
}

export async function changeMultipleColumnValues(
  apiToken: string,
  boardId: string,
  itemId: string,
  columnValues: Record<string, string>
): Promise<void> {
  const columnValuesJson = JSON.stringify(columnValues);
  await mondayRequest<{ change_multiple_column_values: { id: string } }>(
    apiToken,
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values (
        board_id: $boardId,
        item_id: $itemId,
        column_values: $columnValues
      ) {
        id
      }
    }`,
    {
      boardId: String(boardId),
      itemId,
      columnValues: columnValuesJson,
    }
  );
}

export { buildColumnValues };
