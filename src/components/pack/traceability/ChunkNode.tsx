"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getNodeTokens } from "./graph-tokens";
import type { ChunkFlowNode } from "./node-types";
import { formatSourceType, renderSourceTypeIcon, truncate } from "./icon-utils";
import styles from "./traceability.module.css";

function ChunkNodeComponent({ data }: NodeProps<ChunkFlowNode>) {
  const [isHovering, setIsHovering] = useState(false);
  const tokens = getNodeTokens("chunk", data.theme);
  const opacity = data.isDimmed ? 0.2 : 0.95;
  const borderColour = isHovering || data.isSelected ? tokens.border : `${tokens.border}AA`;
  const dramaticGlow = data.presentationMode ? `, 0 0 18px ${tokens.glow}` : "";
  const boxShadow = data.isSelected
    ? `${tokens.shadow.selected}${dramaticGlow}`
    : isHovering || data.isHighlighted
      ? `${tokens.shadow.hover}${dramaticGlow}`
      : "none";

  const snippetText = data.isSummary
    ? `${data.chunkCount ?? 0} chunks available`
    : `"${truncate(data.snippet, 35)}"`;
  const ariaLabel = data.isSummary
    ? `Source chunk summary from ${data.sourceName}: ${data.chunkCount ?? 0} chunks`
    : `Source chunk from ${data.sourceName}: ${truncate(data.snippet, 120)}`;

  return (
    <div
      className={styles.nodeBase}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => data.onSelect?.(data.id)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        data.onSelect?.(data.id);
      }}
      style={{
        width: data.miniMode ? Math.round(tokens.width * 0.9) : tokens.width,
        height: data.miniMode ? Math.round(tokens.height * 0.9) : tokens.height,
        borderRadius: tokens.borderRadius,
        border: `1px solid ${borderColour}`,
        background: tokens.bg,
        color: tokens.text,
        boxShadow,
        opacity,
        padding: data.miniMode ? "6px 9px" : "8px 10px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontSize: data.miniMode ? 10 : 12,
        cursor: "pointer",
        position: "relative",
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

      <p
        style={{
          fontStyle: "italic",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: data.miniMode ? 9 : 12,
        }}
      >
        {snippetText}
      </p>

      <p
        style={{
          marginTop: 2,
          fontSize: data.miniMode ? 8 : 11,
          opacity: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {renderSourceTypeIcon(data.sourceType, data.miniMode ? 10 : 12)}
        <span>{truncate(data.sourceName, 22)}</span>
        {!data.isSummary && <span>· ¶{data.chunkIndex + 1}</span>}
      </p>

      {!data.miniMode && !data.isSummary && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 8px)",
            transform: "translateX(-50%)",
            width: "min(360px, 75vw)",
            maxWidth: 360,
            background: "rgba(2, 6, 23, 0.95)",
            color: "#E2E8F0",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            lineHeight: 1.35,
            opacity: isHovering ? 1 : 0,
            pointerEvents: "none",
            transition: "opacity 150ms ease-out",
            zIndex: 10,
          }}
        >
          <p style={{ marginBottom: 4, opacity: 0.8 }}>{formatSourceType(data.sourceType)}</p>
          <p>{truncate(data.snippet, 200)}</p>
        </div>
      )}
    </div>
  );
}

export const ChunkNode = memo(ChunkNodeComponent);
