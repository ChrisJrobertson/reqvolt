"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getNodeTokens } from "./graph-tokens";
import type { StoryFlowNode } from "./node-types";
import { truncate } from "./icon-utils";
import styles from "./traceability.module.css";

function getQualityColour(score: number): string {
  if (score > 80) return "#22C55E";
  if (score >= 60) return "#F59E0B";
  return "#EF4444";
}

function StoryNodeComponent({ data }: NodeProps<StoryFlowNode>) {
  const tokens = getNodeTokens("story", data.theme);
  const qualityColour = getQualityColour(data.qualityScore);
  const opacity = data.isDimmed ? 0.25 : 1;
  const dramaticGlow = data.presentationMode ? `, 0 0 20px ${tokens.glow}` : "";
  const boxShadow = data.isSelected
    ? `${tokens.shadow.selected}, ${tokens.shadow.glow}${dramaticGlow}`
    : data.isHighlighted
      ? `${tokens.shadow.hover}, ${tokens.shadow.glow}${dramaticGlow}`
      : tokens.shadow.idle;

  const maxDots = 8;
  const ariaLabel = `Story ${data.storyIndex}: As a ${data.persona}, I want to ${data.want}`;

  return (
    <div
      className={`${styles.nodeBase} ${data.isSelected ? styles.nodeSelected : ""}`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => data.onSelect?.(data.id)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        data.onSelect?.(data.id);
      }}
      style={{
        width: data.miniMode ? Math.round(tokens.width * 0.9) : tokens.width,
        height: data.miniMode ? Math.round(tokens.height * 0.9) : tokens.height,
        borderRadius: tokens.borderRadius,
        border: `${data.isSelected ? 3 : 2}px solid ${tokens.border}`,
        background: `linear-gradient(180deg, ${tokens.bg} 0%, ${tokens.bg}F2 100%)`,
        color: tokens.text,
        boxShadow,
        opacity,
        padding: data.miniMode ? "7px 9px" : "9px 11px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: "pointer",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={styles.nodeHandle}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tokens.border,
          border: "none",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          style={{
            borderRadius: 999,
            padding: "1px 8px",
            fontSize: data.miniMode ? 9 : 10,
            fontWeight: 700,
            backgroundColor: `${tokens.border}22`,
            color: tokens.border,
          }}
        >
          S{data.storyIndex}
        </span>
        <p
          style={{
            fontSize: data.miniMode ? 10 : 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          As a {truncate(data.persona, 30)}
        </p>
      </div>

      <p
        style={{
          fontSize: data.miniMode ? 9 : 11,
          opacity: 0.8,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: data.miniMode ? 0 : 3,
        }}
      >
        I want to {truncate(data.want, 40)}
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {data.acCount <= maxDots ? (
            Array.from({ length: data.acCount }).map((_, index) => {
              const filled = index < data.acWithEvidenceCount;
              return (
                <span
                  key={index}
                  aria-hidden
                  style={{
                    width: data.miniMode ? 4 : 6,
                    height: data.miniMode ? 4 : 6,
                    borderRadius: "50%",
                    border: `1px solid ${tokens.border}`,
                    backgroundColor: filled ? tokens.border : "transparent",
                  }}
                />
              );
            })
          ) : (
            <span style={{ fontSize: data.miniMode ? 8 : 10, opacity: 0.8 }}>{data.acCount} ACs</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: 4 }).map((_, index) => {
              const threshold = ((index + 1) / 4) * 100;
              const isFilled = data.qualityScore >= threshold;
              return (
                <span
                  key={index}
                  aria-hidden
                  style={{
                    width: data.miniMode ? 4 : 7,
                    height: data.miniMode ? 4 : 7,
                    borderRadius: 2,
                    border: `1px solid ${qualityColour}`,
                    backgroundColor: isFilled ? qualityColour : "transparent",
                    opacity: isFilled ? 1 : 0.45,
                  }}
                />
              );
            })}
          </div>
          <span style={{ fontSize: data.miniMode ? 8 : 10, color: qualityColour }}>
            {data.qualityScore}%
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={styles.nodeHandle}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tokens.border,
          border: "none",
        }}
      />
    </div>
  );
}

export const StoryNode = memo(StoryNodeComponent);
