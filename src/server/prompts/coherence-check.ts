/**
 * Semantic coherence check: verifies generated stories relate to source topics.
 * Uses Haiku (Tier 2) - cheap classification task.
 */
export interface TopicForCoherence {
  topic: string;
  depth?: string;
  chunkCount?: number;
}

export interface StoryTitleForCoherence {
  persona: string;
  want: string;
}

export function buildCoherenceCheckPrompt(
  topics: TopicForCoherence[],
  storyTitles: StoryTitleForCoherence[]
): { system: string; user: string } {
  const system = `You are a requirements analyst verifying that generated stories match their source material. Return only JSON, no other text.`;

  const storyLines = storyTitles.map(
    (s, i) => `${i}: As a ${s.persona}, I want to ${s.want}`
  );

  const user = `The following topics were identified in the source material:
${JSON.stringify(topics)}

The following stories were generated:
${storyLines.join("\n")}

Identify any stories that do not appear to relate to any of the source topics.
Return:
{
  "coherent": true | false,
  "offTopicStories": [
    { "index": 3, "reason": "No source topic covers notification preferences" }
  ]
}

If all stories relate to at least one source topic, return:
{ "coherent": true, "offTopicStories": [] }`;

  return { system, user };
}
