"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

interface EvidenceLink {
  id: string;
  confidence: string;
  evolutionStatus: string;
  sourceChunk: { content: string };
}

interface Story {
  id: string;
  sortOrder: number;
  persona: string;
  want: string;
  soThat: string;
  acceptanceCriteria: Array<{
    id: string;
    sortOrder: number;
    given: string;
    when: string;
    then: string;
  }>;
}

interface ChangeAnalysis {
  storiesAdded?: string[];
  storiesModified?: string[];
  assumptionsResolved?: string[];
  newAssumptions?: string[];
  newOpenQuestions?: string[];
  evidenceEvolution?: string[];
}

interface QAFlag {
  id: string;
  entityType: string;
  entityId: string;
  ruleCode: string;
  severity: string;
  message: string;
  suggestedFix: string | null;
  resolvedBy: string | null;
}

interface PackVersion {
  id: string;
  versionNumber: number;
  summary: string | null;
  nonGoals: string | null;
  openQuestions: unknown;
  assumptions: unknown;
  decisions: unknown;
  risks: unknown;
  changeAnalysis: ChangeAnalysis | null;
  qaFlags?: QAFlag[];
  editLockUserId?: string | null;
  stories: Story[];
}

interface Pack {
  id: string;
  name: string;
  project: { name: string };
  versions: PackVersion[];
}

interface EvidenceMap {
  story: Record<string, EvidenceLink[]>;
  acceptance_criteria: Record<string, EvidenceLink[]>;
}

export function PackEditor({
  pack,
  evidenceMapByVersionId,
  selectedVersionIndex = 0,
}: {
  pack: Pack;
  evidenceMapByVersionId: Record<string, EvidenceMap>;
  selectedVersionIndex: number;
  onVersionChange?: (index: number) => void;
}) {
  const router = useRouter();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [navSection, setNavSection] = useState<string>("summary");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"qa" | "evidence" | "changes">("evidence");
  const [evidenceTab, setEvidenceTab] = useState<"story" | "acceptance_criteria" | null>(null);
  const [evidenceEntityId, setEvidenceEntityId] = useState<string | null>(null);
  const qaRerunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStory = trpc.pack.updateStory.useMutation({
    onSuccess: (data) => {
      router.refresh();
      scheduleQaRerun(data.packVersionId);
    },
  });
  const updateAC = trpc.pack.updateAcceptanceCriteria.useMutation({
    onSuccess: (data) => {
      router.refresh();
      scheduleQaRerun(data.packVersionId);
    },
  });
  const addStory = trpc.pack.addStory.useMutation({
    onSuccess: (data) => {
      router.refresh();
      scheduleQaRerun(data.packVersionId);
    },
  });
  const addAC = trpc.pack.addAcceptanceCriteria.useMutation({
    onSuccess: (data) => {
      router.refresh();
      scheduleQaRerun(data.packVersionId);
    },
  });
  const deleteStory = trpc.pack.deleteStory.useMutation({
    onSuccess: (data) => {
      router.refresh();
      scheduleQaRerun(data.packVersionId);
    },
  });
  const deleteAC = trpc.pack.deleteAcceptanceCriteria.useMutation({
    onSuccess: (data) => {
      router.refresh();
      scheduleQaRerun(data.packVersionId);
    },
  });
  const runQa = trpc.pack.runQa.useMutation({
    onSuccess: () => router.refresh(),
  });

  const scheduleQaRerun = useCallback((packVersionId: string) => {
    if (qaRerunTimeoutRef.current) clearTimeout(qaRerunTimeoutRef.current);
    qaRerunTimeoutRef.current = setTimeout(() => {
      runQa.mutate({ packVersionId });
      qaRerunTimeoutRef.current = null;
    }, 2000);
  }, [runQa]);

  useEffect(() => {
    return () => {
      if (qaRerunTimeoutRef.current) clearTimeout(qaRerunTimeoutRef.current);
    };
  }, []);

  const DEBOUNCE_MS = 500;
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const debouncedUpdate = useCallback(
    (key: string, fn: () => void) => {
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);
      debounceRefs.current[key] = setTimeout(() => {
        fn();
        delete debounceRefs.current[key];
      }, DEBOUNCE_MS);
    },
    []
  );

  const latestVersion = pack.versions[selectedVersionIndex] ?? pack.versions[0];
  const isLocked = !!latestVersion?.editLockUserId;
  if (!latestVersion) return null;

  const evidenceMap = evidenceMapByVersionId[latestVersion.id] ?? {
    story: {},
    acceptance_criteria: {},
  };

  const getEvidenceCount = (entityType: "story" | "acceptance_criteria", entityId: string) =>
    evidenceMap[entityType]?.[entityId]?.length ?? 0;

  const hasEvidence = (entityType: "story" | "acceptance_criteria", entityId: string) =>
    getEvidenceCount(entityType, entityId) > 0;

  const getQAFlagCount = (entityType: string, entityId: string) =>
    (latestVersion.qaFlags ?? []).filter(
      (f) => !f.resolvedBy && f.entityType === entityType && f.entityId === entityId
    ).length;

  const showEvidence = (entityType: "story" | "acceptance_criteria", entityId: string) => {
    setEvidenceTab(entityType);
    setEvidenceEntityId(entityId);
  };

  const currentEvidence =
    evidenceTab && evidenceEntityId
      ? evidenceMap[evidenceTab]?.[evidenceEntityId] ?? []
      : [];

  const navItems = [
    { id: "summary", label: "Summary" },
    { id: "nonGoals", label: "Non-Goals" },
    { id: "stories", label: "Stories" },
    { id: "assumptions", label: "Assumptions" },
    { id: "decisions", label: "Decisions" },
    { id: "risks", label: "Risks" },
    { id: "openQuestions", label: "Open Questions" },
  ];

  return (
    <div className="flex h-[calc(100vh-8rem)] border rounded-lg overflow-hidden">
      {/* LEFT: Nav tree */}
      <aside
        className={`border-r bg-muted/30 flex flex-col transition-all ${
          leftCollapsed ? "w-12" : "w-[280px]"
        }`}
      >
        <button
          onClick={() => setLeftCollapsed(!leftCollapsed)}
          className="p-2 text-muted-foreground hover:bg-muted text-left"
        >
          {leftCollapsed ? "→" : "←"}
        </button>
        {!leftCollapsed && (
          <nav className="p-2 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setNavSection(item.id);
                  if (item.id === "stories") setSelectedStoryId(null);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg ${
                  navSection === item.id ? "bg-primary/10 font-medium" : "hover:bg-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
            {navSection === "stories" &&
              latestVersion.stories.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedStoryId(s.id);
                    setEvidenceTab(null);
                    setEvidenceEntityId(null);
                  }}
                  className={`w-full text-left pl-6 pr-3 py-1.5 rounded text-sm ${
                    selectedStoryId === s.id ? "bg-primary/10 font-medium" : "hover:bg-muted"
                  }`}
                >
                  {s.persona.slice(0, 40)}
                  {s.persona.length > 40 ? "…" : ""}
                </button>
              ))}
          </nav>
        )}
      </aside>

      {/* CENTRE: Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {navSection === "summary" && latestVersion.summary && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Summary</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {latestVersion.summary}
            </p>
          </section>
        )}

        {navSection === "nonGoals" && latestVersion.nonGoals && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Non-Goals</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {latestVersion.nonGoals}
            </p>
          </section>
        )}

        {navSection === "stories" && (
          <section className="space-y-6">
            {isLocked && (
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded mb-4">
                This version is locked. Unlock to edit.
              </p>
            )}
            {latestVersion.stories.map((story) => (
              <div
                key={story.id}
                className={`p-4 border rounded-lg ${
                  selectedStoryId === story.id ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <input
                    defaultValue={story.persona}
                    readOnly={isLocked}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      debouncedUpdate(`story-persona-${story.id}`, () => {
                        if (v !== story.persona)
                          updateStory.mutate({ storyId: story.id, persona: v });
                      });
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (debounceRefs.current[`story-persona-${story.id}`]) {
                        clearTimeout(debounceRefs.current[`story-persona-${story.id}`]);
                        delete debounceRefs.current[`story-persona-${story.id}`];
                        if (v !== story.persona)
                          updateStory.mutate({ storyId: story.id, persona: v });
                      }
                    }}
                    className="font-medium bg-transparent border-b border-transparent hover:border-muted focus:border-primary focus:outline-none w-full"
                    placeholder="As a..."
                  />
                  <div className="flex gap-2 shrink-0">
                    {getQAFlagCount("story", story.id) > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800">
                        {getQAFlagCount("story", story.id)} QA
                      </span>
                    )}
                    {hasEvidence("story", story.id) ? (
                      <button
                        onClick={() => showEvidence("story", story.id)}
                        className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800"
                      >
                        {getEvidenceCount("story", story.id)} evidence
                      </button>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        Unsupported
                      </span>
                    )}
                    {!isLocked && (
                    <button
                      onClick={() => {
                        if (confirm("Delete this story?")) deleteStory.mutate({ storyId: story.id });
                      }}
                      className="text-xs px-2 py-0.5 rounded hover:bg-red-100 text-red-600"
                    >
                      Delete
                    </button>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-muted-foreground">Want:</label>
                  <input
                    defaultValue={story.want}
                    readOnly={isLocked}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      debouncedUpdate(`story-want-${story.id}`, () => {
                        if (v !== story.want) updateStory.mutate({ storyId: story.id, want: v });
                      });
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (debounceRefs.current[`story-want-${story.id}`]) {
                        clearTimeout(debounceRefs.current[`story-want-${story.id}`]);
                        delete debounceRefs.current[`story-want-${story.id}`];
                        if (v !== story.want) updateStory.mutate({ storyId: story.id, want: v });
                      }
                    }}
                    className="block w-full mt-0.5 text-sm bg-transparent border-b border-transparent hover:border-muted focus:border-primary focus:outline-none"
                    placeholder="I want to..."
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-muted-foreground">So that:</label>
                  <input
                    defaultValue={story.soThat}
                    readOnly={isLocked}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      debouncedUpdate(`story-soThat-${story.id}`, () => {
                        if (v !== story.soThat) updateStory.mutate({ storyId: story.id, soThat: v });
                      });
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (debounceRefs.current[`story-soThat-${story.id}`]) {
                        clearTimeout(debounceRefs.current[`story-soThat-${story.id}`]);
                        delete debounceRefs.current[`story-soThat-${story.id}`];
                        if (v !== story.soThat) updateStory.mutate({ storyId: story.id, soThat: v });
                      }
                    }}
                    className="block w-full mt-0.5 text-sm bg-transparent border-b border-transparent hover:border-muted focus:border-primary focus:outline-none"
                    placeholder="So that..."
                  />
                </div>
                <ul className="mt-3 space-y-2">
                  {story.acceptanceCriteria.map((ac) => (
                    <li key={ac.id} className="text-sm pl-4 border-l-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div>
                            <span className="text-xs text-muted-foreground">Given </span>
                            <input
                              defaultValue={ac.given}
                              readOnly={isLocked}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                debouncedUpdate(`ac-given-${ac.id}`, () => {
                                  if (v !== ac.given) updateAC.mutate({ acId: ac.id, given: v });
                                });
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (debounceRefs.current[`ac-given-${ac.id}`]) {
                                  clearTimeout(debounceRefs.current[`ac-given-${ac.id}`]);
                                  delete debounceRefs.current[`ac-given-${ac.id}`];
                                  if (v !== ac.given) updateAC.mutate({ acId: ac.id, given: v });
                                }
                              }}
                              className="inline w-full max-w-md text-sm bg-transparent border-b border-transparent hover:border-muted focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">When </span>
                            <input
                              defaultValue={ac.when}
                              readOnly={isLocked}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                debouncedUpdate(`ac-when-${ac.id}`, () => {
                                  if (v !== ac.when) updateAC.mutate({ acId: ac.id, when: v });
                                });
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (debounceRefs.current[`ac-when-${ac.id}`]) {
                                  clearTimeout(debounceRefs.current[`ac-when-${ac.id}`]);
                                  delete debounceRefs.current[`ac-when-${ac.id}`];
                                  if (v !== ac.when) updateAC.mutate({ acId: ac.id, when: v });
                                }
                              }}
                              className="inline w-full max-w-md text-sm bg-transparent border-b border-transparent hover:border-muted focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Then </span>
                            <input
                              defaultValue={ac.then}
                              readOnly={isLocked}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                debouncedUpdate(`ac-then-${ac.id}`, () => {
                                  if (v !== ac.then) updateAC.mutate({ acId: ac.id, then: v });
                                });
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (debounceRefs.current[`ac-then-${ac.id}`]) {
                                  clearTimeout(debounceRefs.current[`ac-then-${ac.id}`]);
                                  delete debounceRefs.current[`ac-then-${ac.id}`];
                                  if (v !== ac.then) updateAC.mutate({ acId: ac.id, then: v });
                                }
                              }}
                              className="inline w-full max-w-md text-sm bg-transparent border-b border-transparent hover:border-muted focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {getQAFlagCount("acceptance_criteria", ac.id) > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800">
                              {getQAFlagCount("acceptance_criteria", ac.id)} QA
                            </span>
                          )}
                          {hasEvidence("acceptance_criteria", ac.id) ? (
                            <button
                              onClick={() => showEvidence("acceptance_criteria", ac.id)}
                              className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 shrink-0"
                            >
                              {getEvidenceCount("acceptance_criteria", ac.id)}
                            </button>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                              Unsupported
                            </span>
                          )}
                          {!isLocked && (
                          <button
                            onClick={() => {
                              if (confirm("Delete this acceptance criterion?"))
                                deleteAC.mutate({ acId: ac.id });
                            }}
                            className="text-xs px-2 py-0.5 rounded hover:bg-red-100 text-red-600 shrink-0"
                          >
                            Delete
                          </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {!isLocked && (
                <div className="mt-2">
                  <button
                    onClick={() => {
                      const given = prompt("Given:", "");
                      const when = prompt("When:", "");
                      const then = prompt("Then:", "");
                      if (given && when && then) {
                        addAC.mutate({
                          storyId: story.id,
                          given,
                          when,
                          then,
                        });
                      }
                    }}
                    className="text-xs px-2 py-1 rounded border hover:bg-muted"
                  >
                    + Add AC
                  </button>
                </div>
                )}
              </div>
            ))}
            {!isLocked && (
            <button
              onClick={() => {
                const persona = prompt("Persona (As a...):", "user");
                const want = prompt("Want:", "");
                const soThat = prompt("So that:", "");
                if (persona && want && soThat) {
                  addStory.mutate({
                    packVersionId: latestVersion.id,
                    persona,
                    want,
                    soThat,
                  });
                }
              }}
              className="text-sm px-3 py-2 rounded border border-dashed hover:bg-muted w-full"
            >
              + Add Story
            </button>
            )}
          </section>
        )}

        {navSection === "assumptions" && Array.isArray(latestVersion.assumptions) && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Assumptions</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              {(latestVersion.assumptions as string[]).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </section>
        )}

        {navSection === "decisions" && Array.isArray(latestVersion.decisions) && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Decisions</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              {(latestVersion.decisions as string[]).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </section>
        )}

        {navSection === "risks" && Array.isArray(latestVersion.risks) && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Risks</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              {(latestVersion.risks as string[]).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {navSection === "openQuestions" && Array.isArray(latestVersion.openQuestions) && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Open Questions</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              {(latestVersion.openQuestions as string[]).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* RIGHT: QA Flags, Evidence, Changes */}
      <aside
        className={`border-l bg-muted/30 flex flex-col transition-all ${
          rightCollapsed ? "w-12" : "w-[320px]"
        }`}
      >
        <button
          onClick={() => setRightCollapsed(!rightCollapsed)}
          className="p-2 text-muted-foreground hover:bg-muted text-right"
        >
          {rightCollapsed ? "←" : "→"}
        </button>
        {!rightCollapsed && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex border-b">
              <button
                onClick={() => setRightTab("qa")}
                className={`flex-1 px-3 py-2 text-sm ${
                  rightTab === "qa" ? "border-b-2 border-primary font-medium" : ""
                }`}
              >
                QA Flags
              </button>
              <button
                onClick={() => setRightTab("evidence")}
                className={`flex-1 px-3 py-2 text-sm ${
                  rightTab === "evidence" ? "border-b-2 border-primary font-medium" : ""
                }`}
              >
                Evidence
              </button>
              <button
                onClick={() => setRightTab("changes")}
                className={`flex-1 px-3 py-2 text-sm ${
                  rightTab === "changes" ? "border-b-2 border-primary font-medium" : ""
                }`}
              >
                Changes
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {rightTab === "evidence" && evidenceTab && evidenceEntityId ? (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm">Evidence</h3>
                  {currentEvidence.map((el) => (
                    <div
                      key={el.id}
                      className="p-2 rounded bg-background border text-sm"
                    >
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded mr-1 ${
                          el.evolutionStatus === "new"
                            ? "bg-blue-100"
                            : el.evolutionStatus === "strengthened"
                              ? "bg-green-100"
                              : el.evolutionStatus === "contradicted"
                                ? "bg-red-100"
                                : "bg-gray-100"
                        }`}
                      >
                        {el.evolutionStatus}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {el.confidence}
                      </span>
                      <p className="mt-1 text-muted-foreground line-clamp-4">
                        {el.sourceChunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : rightTab === "evidence" ? (
                <p className="text-sm text-muted-foreground">
                  Click an evidence badge on a story or acceptance criterion to view
                  supporting source material.
                </p>
              ) : rightTab === "qa" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">QA Flags</h3>
                    <button
                      onClick={() => runQa.mutate({ packVersionId: latestVersion.id })}
                      disabled={runQa.isPending}
                      className="text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
                    >
                      {runQa.isPending ? "Running..." : "Re-run QA"}
                    </button>
                  </div>
                  {(latestVersion.qaFlags?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {latestVersion.qaFlags
                      ?.filter((f) => !f.resolvedBy)
                      .map((f) => (
                        <div
                          key={f.id}
                          className={`p-2 rounded border-l-4 text-sm border ${
                            f.severity === "high"
                              ? "border-l-red-500"
                              : f.severity === "medium"
                                ? "border-l-amber-500"
                                : "border-l-gray-500"
                          }`}
                        >
                          <span className="text-xs font-medium text-muted-foreground">
                            {f.ruleCode}
                          </span>
                          <p className="mt-0.5">{f.message}</p>
                          {f.suggestedFix && (
                            <p className="mt-1 text-muted-foreground text-xs">
                              Suggested: {f.suggestedFix}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No QA flags. All criteria pass the quality checks.
                    </p>
                  )}
                </div>
              ) : rightTab === "changes" ? (
                latestVersion.changeAnalysis &&
                Object.keys(latestVersion.changeAnalysis).length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm">Change Analysis</h3>
                    {latestVersion.changeAnalysis.storiesAdded?.length ? (
                      <div>
                        <span className="text-xs font-medium text-green-700">Stories Added</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {latestVersion.changeAnalysis.storiesAdded.map((s, i) => (
                            <li key={i} className="text-muted-foreground">+ {s}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {latestVersion.changeAnalysis.storiesModified?.length ? (
                      <div>
                        <span className="text-xs font-medium text-blue-700">Stories Modified</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {latestVersion.changeAnalysis.storiesModified.map((s, i) => (
                            <li key={i} className="text-muted-foreground">~ {s}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {latestVersion.changeAnalysis.assumptionsResolved?.length ? (
                      <div>
                        <span className="text-xs font-medium text-green-700">Assumptions Resolved</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {latestVersion.changeAnalysis.assumptionsResolved.map((a, i) => (
                            <li key={i} className="text-muted-foreground">✓ {a}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {latestVersion.changeAnalysis.newAssumptions?.length ? (
                      <div>
                        <span className="text-xs font-medium text-amber-700">New Assumptions</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {latestVersion.changeAnalysis.newAssumptions.map((a, i) => (
                            <li key={i} className="text-muted-foreground">+ {a}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {latestVersion.changeAnalysis.newOpenQuestions?.length ? (
                      <div>
                        <span className="text-xs font-medium text-amber-700">New Open Questions</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {latestVersion.changeAnalysis.newOpenQuestions.map((q, i) => (
                            <li key={i} className="text-muted-foreground">? {q}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {latestVersion.changeAnalysis.evidenceEvolution?.length ? (
                      <div>
                        <span className="text-xs font-medium text-blue-700">Evidence Evolution</span>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {latestVersion.changeAnalysis.evidenceEvolution.map((e, i) => (
                            <li key={i} className="text-muted-foreground">{e}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Change analysis appears here after refreshing with new sources.
                  </p>
                )
              ) : null}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
