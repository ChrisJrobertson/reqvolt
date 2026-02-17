"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getNodeTokens } from "./graph-tokens";
import type { ACFlowNode, ACNodeData } from "./node-types";
import styles from "./traceability.module.css";

function getConfidenceStyle(strongestConfidence: ACNodeData["strongestConfidence"]) {
  if (strongestConfidence === "direct") {
    return { border: "#16A34A", icon: "✓", iconColour: "#16A34A", label: "direct" };
  }
  if (strongestConfidence === "inferred") {
    return { border: "#F59E0B", icon: "~", iconColour: "#F59E0B", label: "inferred" };
  }
  if (strongestConfidence === "assumption") {
    return { border: "#EF4444", icon: "✗", iconColour: "#EF4444", label: "assumption" };
  }
  return { border: "#9CA3AF", icon: "?", iconColour: "#9CA3AF", label: "none" };
}

function ACNodeComponent({ data }: NodeProps<ACFlowNode>) {
  const [isHovering, setIsHovering] = useState(false);
  const tokens = getNodeTokens("ac", data.theme);
  const confidenceStyle = getConfidenceStyle(data.strongestConfidence);
  const opacity = data.isDimmed ? 0.25 : 1;
  const dramaticGlow = data.presentationMode ? `, 0 0 20px ${tokens.glow}` : "";
  const boxShadow = data.isSelected
    ? `${tokens.shadow.selected}, ${tokens.shadow.glow}${dramaticGlow}`
    : data.isHighlighted
      ? `${tokens.shadow.hover}, ${tokens.shadow.glow}${dramaticGlow}`
      : tokens.shadow.idle;

  const evidenceLabel =
    data.evidenceCount === 0 ? "no evidence" : `${data.evidenceCount} evidence`;
  const ariaLabel =
    `Acceptance criterion ${data.criterionIndex}: Given ${data.given}. When ${data.when}. ` +
    `Then ${data.then}. Supported by ${data.evidenceCount} ${confidenceStyle.label} evidence links`;

  return (
    <div
      className={`${styles.nodeBase} ${data.isSelected ? styles.nodeSelected : ""}`}
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
        border: `${data.isSelected ? 3 : 2}px solid ${confidenceStyle.border}`,
        background: tokens.bg,
        color: tokens.text,
        boxShadow,
        opacity,
        padding: data.miniMode ? "5px 10px" : "7px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
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
          background: confidenceStyle.border,
          border: "none",
        }}
      />

      <p style={{ fontSize: data.miniMode ? 10 : 12, fontWeight: 700 }}>AC {data.criterionIndex}</p>
      <p style={{ fontSize: data.miniMode ? 9 : 11, opacity: 0.85, display: "flex", gap: 6, alignItems: "center" }}>
        <span aria-hidden style={{ color: confidenceStyle.iconColour, fontWeight: 700 }}>
          {confidenceStyle.icon}
        </span>
        <span>{evidenceLabel}</span>
      </p>

      {!data.miniMode && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 10px)",
            transform: "translateX(-50%)",
            width: "min(400px, 80vw)",
            maxWidth: 400,
            background: "rgba(15, 23, 42, 0.95)",
            color: "#F8FAFC",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.35,
            opacity: isHovering ? 1 : 0,
            pointerEvents: "none",
            transition: "opacity 150ms ease-out",
            zIndex: 12,
            boxShadow: "0 8px 22px rgba(2, 6, 23, 0.45)",
          }}
        >
          <p>
            <strong>Given</strong> {data.given}
          </p>
          <p>
            <strong>When</strong> {data.when}
          </p>
          <p>
            <strong>Then</strong> {data.then}
          </p>
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
          background: confidenceStyle.border,
          border: "none",
        }}
      />
    </div>
  );
}

export const ACNode = memo(ACNodeComponent);
