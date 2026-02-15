/**
 * DOCX export for Story Packs.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";

interface Story {
  persona: string;
  want: string;
  soThat: string;
  acceptanceCriteria: Array< { given: string; when: string; then: string }>;
}

interface PackVersionData {
  summary: string | null;
  nonGoals: string | null;
  openQuestions: string[];
  assumptions: string[];
  decisions: string[];
  risks: string[];
  stories: Story[];
}

export async function buildDocx(
  packName: string,
  projectName: string,
  versionNumber: number,
  data: PackVersionData
): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: packName,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${projectName} – Version ${versionNumber}`, italics: true }),
      ],
      spacing: { after: 400 },
    })
  );

  if (data.summary) {
    children.push(
      new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
      new Paragraph({ text: data.summary, spacing: { after: 400 } })
    );
  }

  if (data.nonGoals) {
    children.push(
      new Paragraph({ text: "Non-Goals", heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
      new Paragraph({ text: data.nonGoals, spacing: { after: 400 } })
    );
  }

  children.push(
    new Paragraph({ text: "User Stories", heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } })
  );

  for (let i = 0; i < data.stories.length; i++) {
    const s = data.stories[i]!;
    children.push(
      new Paragraph({
        text: `Story ${i + 1}: ${s.persona}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Want: ", bold: true }),
          new TextRun(s.want),
        ],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "So that: ", bold: true }),
          new TextRun(s.soThat),
        ],
        spacing: { after: 120 },
      })
    );

    if (s.acceptanceCriteria.length > 0) {
      children.push(
        new Paragraph({
          text: "Acceptance Criteria",
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 120, after: 80 },
        })
      );
      for (const ac of s.acceptanceCriteria) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Given ", bold: true }),
              new TextRun(ac.given),
              new TextRun({ text: " When ", bold: true }),
              new TextRun(ac.when),
              new TextRun({ text: " Then ", bold: true }),
              new TextRun(ac.then),
            ],
            spacing: { after: 60 },
          })
        );
      }
    }
  }

  if (data.assumptions.length > 0) {
    children.push(
      new Paragraph({ text: "Assumptions", heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
      ...data.assumptions.map((a) => new Paragraph({ text: `• ${a}`, spacing: { after: 80 } }))
    );
  }

  if (data.decisions.length > 0) {
    children.push(
      new Paragraph({ text: "Decisions", heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
      ...data.decisions.map((d) => new Paragraph({ text: `• ${d}`, spacing: { after: 80 } }))
    );
  }

  if (data.risks.length > 0) {
    children.push(
      new Paragraph({ text: "Risks", heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
      ...data.risks.map((r) => new Paragraph({ text: `• ${r}`, spacing: { after: 80 } }))
    );
  }

  if (data.openQuestions.length > 0) {
    children.push(
      new Paragraph({ text: "Open Questions", heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }),
      ...data.openQuestions.map((q) => new Paragraph({ text: `• ${q}`, spacing: { after: 80 } }))
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
