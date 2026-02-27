/**
 * HTML Client Pack export for Story Packs.
 * Self-contained HTML file with inline CSS, Reqvolt branding.
 */
interface Story {
  id: string;
  persona: string;
  want: string;
  soThat: string;
  acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
  evidenceCount?: number;
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

interface QAStats {
  pass: number;
  warn: number;
  fail: number;
}

interface ExportInput {
  packName: string;
  projectName: string;
  clientName?: string | null;
  versionNumber: number;
  sourceNames: string[];
  generationDate: string;
  data: PackVersionData;
  qaStats?: QAStats;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildHtml(input: ExportInput): Buffer {
  const {
    packName,
    projectName,
    clientName,
    versionNumber,
    sourceNames,
    generationDate,
    data,
    qaStats = { pass: 0, warn: 0, fail: 0 },
  } = input;

  const sections: string[] = [];

  // TOC
  sections.push('<nav class="toc"><h3>Table of Contents</h3><ul>');
  if (data.summary) sections.push('<li><a href="#summary">Summary</a></li>');
  if (data.nonGoals) sections.push('<li><a href="#non-goals">Non-Goals</a></li>');
  sections.push('<li><a href="#stories">User Stories</a></li>');
  if (data.assumptions.length) sections.push('<li><a href="#assumptions">Assumptions</a></li>');
  if (data.decisions.length) sections.push('<li><a href="#decisions">Decisions</a></li>');
  if (data.risks.length) sections.push('<li><a href="#risks">Risks</a></li>');
  if (data.openQuestions.length)
    sections.push('<li><a href="#open-questions">Open Questions</a></li>');
  sections.push('<li><a href="#qa-summary">QA Summary</a></li>');
  sections.push("</ul></nav>");

  if (data.summary) {
    sections.push(
      `<section id="summary"><h2>Summary</h2><p>${escapeHtml(data.summary)}</p></section>`
    );
  }
  if (data.nonGoals) {
    sections.push(
      `<section id="non-goals"><h2>Non-Goals</h2><p>${escapeHtml(data.nonGoals)}</p></section>`
    );
  }

  sections.push('<section id="stories"><h2>User Stories</h2>');
  for (let i = 0; i < data.stories.length; i++) {
    const s = data.stories[i]!;
    const evidenceBadge =
      (s.evidenceCount ?? 0) >= 1
        ? '<span class="badge badge-green">Evidence</span>'
        : '<span class="badge badge-red">No evidence</span>';
    sections.push(`
      <div class="story" id="story-${s.id}">
        <h3>Story ${i + 1}: ${escapeHtml(s.persona)} ${evidenceBadge}</h3>
        <p><strong>Want:</strong> ${escapeHtml(s.want)}</p>
        <p><strong>So that:</strong> ${escapeHtml(s.soThat)}</p>
        ${
          s.acceptanceCriteria.length
            ? `<div class="ac-list"><h4>Acceptance Criteria</h4><ul>${s.acceptanceCriteria
                .map(
                  (ac) =>
                    `<li>Given ${escapeHtml(ac.given)} When ${escapeHtml(ac.when)} Then ${escapeHtml(ac.then)}</li>`
                )
                .join("")}</ul></div>`
            : ""
        }
      </div>
    `);
  }
  sections.push("</section>");

  if (data.assumptions.length) {
    sections.push(
      `<section id="assumptions"><h2>Assumptions</h2><ul>${data.assumptions
        .map((a) => `<li>${escapeHtml(a)}</li>`)
        .join("")}</ul></section>`
    );
  }
  if (data.decisions.length) {
    sections.push(
      `<section id="decisions"><h2>Decisions</h2><ul>${data.decisions
        .map((d) => `<li>${escapeHtml(d)}</li>`)
        .join("")}</ul></section>`
    );
  }
  if (data.risks.length) {
    sections.push(
      `<section id="risks"><h2>Risks</h2><ul>${data.risks
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join("")}</ul></section>`
    );
  }
  if (data.openQuestions.length) {
    sections.push(
      `<section id="open-questions"><h2>Open Questions</h2><ul>${data.openQuestions
        .map((q) => `<li>${escapeHtml(q)}</li>`)
        .join("")}</ul></section>`
    );
  }

  sections.push(`
    <section id="qa-summary"><h2>QA Summary</h2>
    <div class="qa-stats">
      <span class="qa-pass">Pass: ${qaStats.pass}</span>
      <span class="qa-warn">Warn: ${qaStats.warn}</span>
      <span class="qa-fail">Fail: ${qaStats.fail}</span>
    </div>
    </section>
  `);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(packName)} - ${escapeHtml(projectName)}</title>
  <style>
    :root { --navy: #1B2A4A; --teal: #0D8B8B; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #fff; color: #333; }
    .header { border-bottom: 3px solid var(--teal); padding-bottom: 1rem; margin-bottom: 2rem; }
    .header h1 { color: var(--navy); margin: 0 0 0.25rem 0; font-size: 1.75rem; }
    .header .meta { color: #666; font-size: 0.9rem; }
    .toc { background: #f8f9fa; padding: 1rem 1.5rem; border-radius: 8px; margin-bottom: 2rem; }
    .toc h3 { margin: 0 0 0.5rem 0; color: var(--navy); font-size: 1rem; }
    .toc ul { margin: 0; padding-left: 1.25rem; }
    .toc a { color: var(--teal); text-decoration: none; }
    .toc a:hover { text-decoration: underline; }
    section { margin-bottom: 2rem; }
    section h2 { color: var(--navy); font-size: 1.25rem; margin-bottom: 1rem; }
    .story { border: 1px solid #e0e0e0; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    .story h3 { color: var(--navy); font-size: 1.1rem; margin: 0 0 0.5rem 0; }
    .badge { font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 4px; margin-left: 0.5rem; }
    .badge-green { background: #d4edda; color: #155724; }
    .badge-red { background: #f8d7da; color: #721c24; }
    .ac-list ul { margin: 0.5rem 0 0 0; padding-left: 1.25rem; }
    .ac-list li { margin-bottom: 0.25rem; }
    .qa-stats { display: flex; gap: 1rem; }
    .qa-pass { color: #155724; }
    .qa-warn { color: #856404; }
    .qa-fail { color: #721c24; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; font-size: 0.8rem; color: #666; }
  </style>
</head>
<body>
  <header class="header">
    <h1>${escapeHtml(packName)}</h1>
    <div class="meta">
      ${escapeHtml(projectName)}${clientName ? ` · ${escapeHtml(clientName)}` : ""} · Version ${versionNumber} · ${escapeHtml(generationDate)}
    </div>
    <div class="meta">Sources: ${escapeHtml(sourceNames.join(", "))}</div>
  </header>
  ${sections.join("\n")}
  <footer class="footer">
    Generated by Reqvolt · ${new Date().toISOString()}
  </footer>
</body>
</html>`;

  return Buffer.from(html, "utf-8");
}
