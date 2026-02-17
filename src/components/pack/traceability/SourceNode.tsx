"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getNodeTokens } from "./graph-tokens";
import type { SourceFlowNode } from "./node-types";
import { formatSourceType, renderSourceTypeIcon, truncate } from "./icon-utils";
import styles from "./traceability.module.css";

function SourceNodeComponent({ data }: NodeProps<SourceFlowNode>) {
  const tokens = getNodeTokens("source", data.theme);
  const opacity = data.isDimmed ? 0.25 : 1;
  const dramaticGlow = data.presentationMode ? `, 0 0 20px ${tokens.glow}` : "";
  const boxShadow = data.isSelected
    ? `${tokens.shadow.selected}, ${tokens.shadow.glow}${dramaticGlow}`
    : data.isHighlighted
      ? `${tokens.shadow.hover}, ${tokens.shadow.glow}${dramaticGlow}`
      : tokens.shadow.idle;

  const ariaLabel = `Source: ${data.name}, ${formatSourceType(data.sourceType)} document, ${data.chunkCount} chunks`;

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
        padding: data.miniMode ? "8px 10px" : "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: data.miniMode ? 8 : 10,
        cursor: "pointer",
      }}
    >
      <div
        aria-hidden
        style={{
          width: data.miniMode ? 18 : 20,
          height: data.miniMode ? 18 : 20,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {renderSourceTypeIcon(data.sourceType, data.miniMode ? 14 : 16)}
      </div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: data.miniMode ? 11 : 13,
            fontWeight: 600,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {truncate(data.name, 28)}
        </p>
        <p
          style={{
            fontSize: data.miniMode ? 9 : 11,
            opacity: 0.75,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {formatSourceType(data.sourceType)} · {data.chunkCount} chunks · {data.fileSize}
        </p>
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

export const SourceNode = memo(SourceNodeComponent);
