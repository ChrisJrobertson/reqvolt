interface TopicForCoherence {
  topic: string;
  depth: "detailed" | "moderate" | "mentioned" | "minimal";
  chunkCount: number;
}

interface StoryTitleForCoherence {
  persona: string;
  want: string;
}

export const COHERENCE_CHECK_SYSTEM_PROMPT = `You are a requirements analyst verifying that generated stories match
their source material. Return only JSON, no other text.`;

export function buildCoherenceCheckPrompt(
  topics: TopicForCoherence[],
  storyTitles: StoryTitleForCoherence[]
): string {
  const storyLines = storyTitles
    .map((story, index) => `${index}: As a ${story.persona}, I want to ${story.want}`)
    .join("\n");

  return `The following topics were identified in the source material:
${JSON.stringify(topics)}

The following stories were generated:
${storyLines}

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
}
