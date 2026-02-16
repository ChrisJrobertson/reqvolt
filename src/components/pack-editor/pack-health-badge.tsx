"use client";

/**
 * PackHealthBadge - Colour-coded health pill for pack list and detail header.
 * Spec: healthy=green, stale=amber, at_risk=orange, outdated=red
 */
interface PackHealthBadgeProps {
  score: number;
  status: "healthy" | "stale" | "at_risk" | "outdated";
  tooltip?: string;
}

const STATUS_CONFIG = {
  healthy: {
    bg: "bg-green-500",
    text: "text-white",
    icon: "✓",
  },
  stale: {
    bg: "bg-amber-500",
    text: "text-gray-900",
    icon: "⚠",
  },
  at_risk: {
    bg: "bg-orange-500",
    text: "text-white",
    icon: "⚠",
  },
  outdated: {
    bg: "bg-red-500",
    text: "text-white",
    icon: "✗",
  },
} as const;

export function PackHealthBadge({ score, status, tooltip }: PackHealthBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.healthy;
  const title = tooltip ?? `${status} (${score})`;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span aria-hidden>{config.icon}</span>
      <span>{score}</span>
    </span>
  );
}
