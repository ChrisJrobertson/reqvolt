"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { TraceFlowEdge, TracedEdgeData } from "./node-types";
import styles from "./traceability.module.css";

function getStrokeColour(edgeType: string, confidence: TracedEdgeData["confidence"], isDark: boolean): string {
  if (edgeType === "source-to-story") return isDark ? "#CBD5E1" : "#94A3B8";
  if (edgeType === "story-to-ac") return isDark ? "#9CA3AF" : "#6B7280";
  if (edgeType === "evidence-to-chunk") return isDark ? "#E2E8F0" : "#D1D5DB";
  if (confidence === "direct") return isDark ? "#4ADE80" : "#22C55E";
  if (confidence === "inferred") return isDark ? "#FBBF24" : "#F59E0B";
  if (confidence === "assumption") return isDark ? "#F87171" : "#EF4444";
  return isDark ? "#CBD5E1" : "#94A3B8";
}

function getDashArray(edgeType: string): string | undefined {
  if (edgeType === "source-to-story") return "6 4";
  if (edgeType === "evidence-to-chunk") return "2 6";
  return undefined;
}

export function TracedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<TraceFlowEdge>) {
  const isDark = data?.theme === "dark";
  const distance = Math.abs(targetX - sourceX);
  const curvature = distance > 400 ? 0.5 : 0.4;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature,
  });

  const stroke = getStrokeColour(data?.edgeType ?? "source-to-story", data?.confidence, isDark);
  const baseOpacity = isDark ? 0.75 : 0.65;
  const opacity = data?.isDimmed ? 0.1 : data?.isHighlighted ? 1 : baseOpacity;
  const strokeWidth = data?.isHighlighted ? 3 : 2;
  const dashArray = getDashArray(data?.edgeType ?? "source-to-story");
  const animate = data?.animate || data?.presentationMode;
  const animatedDashArray = dashArray ?? "8 4";
  const labelText = data?.label;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={`${styles.edgePath} ${animate ? styles.tracedEdgeAnimated : ""}`}
        style={{
          stroke,
          strokeWidth,
          opacity,
          strokeDasharray: animate ? animatedDashArray : dashArray,
        }}
      />
      {data?.showLabel && labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              backgroundColor: `${stroke}1A`,
              color: stroke,
              borderRadius: 999,
              border: `1px solid ${stroke}55`,
              padding: "2px 8px",
              fontSize: 10,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              transition: "opacity 150ms ease-out",
              opacity: 1,
            }}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
