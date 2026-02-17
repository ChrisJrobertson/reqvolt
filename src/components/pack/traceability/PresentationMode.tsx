"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, Maximize2, Minimize2, Minus, Plus } from "lucide-react";

export interface PresentationFilters {
  nodeTypes: {
    source: boolean;
    story: boolean;
    ac: boolean;
    evidence: boolean;
    chunk: boolean;
  };
  confidences: {
    direct: boolean;
    inferred: boolean;
    assumption: boolean;
  };
}

interface PresentationModeProps {
  packName: string;
  canPresent: boolean;
  isPresentationMode: boolean;
  onTogglePresentation: () => void;
  showToggleButton?: boolean;
  filters: PresentationFilters;
  onFiltersChange: (next: PresentationFilters) => void;
  onFiltersReset: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitView: () => void;
}

const TOOLBAR_HIDE_DELAY = 3000;

export function PresentationMode({
  packName,
  canPresent,
  isPresentationMode,
  onTogglePresentation,
  showToggleButton = true,
  filters,
  onFiltersChange,
  onFiltersReset,
  onZoomOut,
  onZoomIn,
  onFitView,
}: PresentationModeProps) {
  const [isToolbarVisible, setToolbarVisible] = useState(true);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleHideToolbar = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setToolbarVisible(false), TOOLBAR_HIDE_DELAY);
  }, [clearHideTimer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "p" || event.key === "P") && canPresent) {
        event.preventDefault();
        onTogglePresentation();
      }
      if (event.key === "Escape" && isPresentationMode) {
        event.preventDefault();
        onTogglePresentation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canPresent, isPresentationMode, onTogglePresentation]);

  useEffect(() => {
    if (!isPresentationMode) return;
    const onMouseMove = () => {
      setToolbarVisible(true);
      scheduleHideToolbar();
    };
    window.addEventListener("mousemove", onMouseMove);
    scheduleHideToolbar();
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      clearHideTimer();
    };
  }, [clearHideTimer, isPresentationMode, scheduleHideToolbar]);

  const activeFilterCount = useMemo(() => {
    const hiddenNodeTypes = Object.values(filters.nodeTypes).filter((enabled) => !enabled).length;
    const hiddenConfidences = Object.values(filters.confidences).filter((enabled) => !enabled).length;
    return hiddenNodeTypes + hiddenConfidences;
  }, [filters.confidences, filters.nodeTypes]);

  if (!canPresent) return null;

  return (
    <>
      {showToggleButton && (
        <button
          onClick={onTogglePresentation}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {isPresentationMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {isPresentationMode ? "Exit" : "Present"}
        </button>
      )}

      <AnimatePresence>
        {isPresentationMode && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: isToolbarVisible ? 1 : 0, y: isToolbarVisible ? 0 : 8 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-5 right-5 z-[80]"
          >
            <div className="relative rounded-2xl bg-black/50 px-4 py-2 text-white shadow-xl backdrop-blur-sm">
              <div className="flex items-center gap-3 text-xs">
                <span className="rounded-full bg-white/10 px-3 py-1">
                  {packName} · Traceability
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={onZoomOut}
                    className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
                    aria-label="Zoom out"
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    onClick={onFitView}
                    className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
                  >
                    Fit
                  </button>
                  <button
                    onClick={onZoomIn}
                    className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
                    aria-label="Zoom in"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <button
                  onClick={() => setShowFilterPopover((open) => !open)}
                  className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
                >
                  <Filter size={12} />
                  Filter
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </button>
                <button
                  onClick={onTogglePresentation}
                  className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
                >
                  Exit
                </button>
              </div>

              <AnimatePresence>
                {showFilterPopover && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="absolute bottom-[calc(100%+10px)] right-0 w-72 rounded-2xl bg-black/50 p-4 text-xs text-white backdrop-blur-sm"
                  >
                    <p className="mb-2 font-semibold">Node types</p>
                    <div className="space-y-1.5">
                      {(
                        [
                          ["source", "Sources", "#3B82F6"],
                          ["story", "Stories", "#8B5CF6"],
                          ["ac", "Acceptance Criteria", "#22C55E"],
                          ["evidence", "Evidence", "#F59E0B"],
                          ["chunk", "Source Chunks", "#9CA3AF"],
                        ] as const
                      ).map(([key, label, colour]) => (
                        <label key={key} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={filters.nodeTypes[key]}
                            onChange={(event) =>
                              onFiltersChange({
                                ...filters,
                                nodeTypes: { ...filters.nodeTypes, [key]: event.target.checked },
                              })
                            }
                          />
                          <span
                            aria-hidden
                            style={{ width: 8, height: 8, borderRadius: "50%", background: colour }}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>

                    <p className="mb-2 mt-4 font-semibold">Confidence</p>
                    <div className="space-y-1.5">
                      {(
                        [
                          ["direct", "Direct evidence"],
                          ["inferred", "Inferred evidence"],
                          ["assumption", "Assumptions"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={filters.confidences[key]}
                            onChange={(event) =>
                              onFiltersChange({
                                ...filters,
                                confidences: {
                                  ...filters.confidences,
                                  [key]: event.target.checked,
                                },
                              })
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>

                    <button
                      onClick={onFiltersReset}
                      className="mt-4 text-[11px] text-slate-200 underline underline-offset-2 hover:text-white"
                    >
                      Reset
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
