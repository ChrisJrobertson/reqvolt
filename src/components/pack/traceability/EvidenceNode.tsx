"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HelpCircle, Lightbulb, ShieldCheck } from "lucide-react";
import { getNodeTokens } from "./graph-tokens";
import type { EvidenceFlowNode } from "./node-types";
import styles from "./traceability.module.css";
import { truncate } from "./icon-utils";

function EvidenceNodeComponent({ data }: NodeProps<EvidenceFlowNode>) {
  const [isHovering, setIsHovering] = useState(false);
  const tokens = getNodeTokens("evidence", data.theme, data.confidence);
  const opacity = data.isDimmed ? 0.2 : 1;
  const borderWidth = data.isSelected ? 3 : 2;
  const scale = isHovering ? 1.1 : 1;
  const boxShadow = data.isSelected
    ? `${tokens.shadow.selected}, ${tokens.shadow.glow}`
    : isHovering || data.isHighlighted || data.presentationMode
      ? `${tokens.shadow.hover}, ${tokens.shadow.glow}`
      : `${tokens.shadow.idle}, ${tokens.shadow.glow}`;

  const iconSize = data.miniMode ? 12 : 16;
  const Icon =
    data.confidence === "direct"
      ? ShieldCheck
      : data.confidence === "inferred"
        ? Lightbulb
        : HelpCircle;

  const confidenceText =
    data.confidence === "direct"
      ? "Direct"
      : data.confidence === "inferred"
        ? "Inferred"
        : "Assumption";

  const ariaLabel = `${confidenceText} evidence from ${data.sourceName}, confidence: ${data.confidence}`;

  return (
    <div
      className={data.isSelected ? styles.nodeGlowPulse : ""}
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
        width: data.miniMode ? 44 : tokens.width,
        height: data.miniMode ? 44 : tokens.height,
        borderRadius: tokens.borderRadius,
        border: `${borderWidth}px solid ${tokens.border}`,
        backgroundColor: tokens.bg,
        color: tokens.text,
        boxShadow,
        opacity,
        transform: `rotate(45deg) scale(${scale})`,
        transition: "transform 200ms ease-out, box-shadow 200ms ease-out, opacity 200ms ease-out",
        display: "grid",
        placeItems: "center",
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
          transform: "rotate(-45deg)",
        }}
      />

      <div style={{ transform: "rotate(-45deg)", display: "grid", placeItems: "center" }}>
        <Icon size={iconSize} color={tokens.border} aria-hidden />
      </div>

      {!data.miniMode && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 10px)",
            transform: "translateX(-50%) rotate(-45deg)",
            width: "min(280px, 70vw)",
            background: "rgba(2, 6, 23, 0.96)",
            color: "#E2E8F0",
            borderRadius: 10,
            padding: "9px 11px",
            fontSize: 12,
            lineHeight: 1.35,
            opacity: isHovering ? 1 : 0,
            pointerEvents: "none",
            transition: "opacity 150ms ease-out",
            zIndex: 12,
            boxShadow: "0 8px 22px rgba(2, 6, 23, 0.45)",
          }}
        >
          <p style={{ fontWeight: 600 }}>
            {confidenceText} evidence from {data.sourceName}
          </p>
          <p style={{ marginTop: 4 }}>
            &ldquo;{truncate(data.snippet, 80)}&rdquo;
          </p>
          <p style={{ marginTop: 4, opacity: 0.82 }}>Confidence: {confidenceText}</p>
        </div>
      )}

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
          transform: "rotate(-45deg)",
        }}
      />
    </div>
  );
}

export const EvidenceNode = memo(EvidenceNodeComponent);
