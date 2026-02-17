import type { TraceConfidence } from "@/lib/traceability/graph-types";

export type GraphTheme = "light" | "dark";

interface NodeDimensions {
  width: number;
  height: number;
  borderRadius: number;
}

interface NodePalette {
  bg: string;
  border: string;
  text: string;
  glow: string;
}

export interface NodeTokens extends NodePalette, NodeDimensions {
  shadow: {
    idle: string;
    hover: string;
    glow: string;
    selected: string;
  };
}

const DIMENSIONS: Record<string, NodeDimensions> = {
  source: { width: 220, height: 72, borderRadius: 12 },
  story: { width: 240, height: 80, borderRadius: 16 },
  ac: { width: 180, height: 48, borderRadius: 24 },
  evidence: { width: 56, height: 56, borderRadius: 28 },
  chunk: { width: 200, height: 64, borderRadius: 8 },
};

const PALETTES: Record<
  string,
  Record<GraphTheme, NodePalette> | Record<TraceConfidence, Record<GraphTheme, NodePalette>>
> = {
  source: {
    light: {
      bg: "#EFF6FF",
      border: "#3B82F6",
      text: "#1E3A5F",
      glow: "rgba(59,130,246,0.25)",
    },
    dark: {
      bg: "#1E293B",
      border: "#60A5FA",
      text: "#BFDBFE",
      glow: "rgba(96,165,250,0.30)",
    },
  },
  story: {
    light: {
      bg: "#F5F3FF",
      border: "#8B5CF6",
      text: "#3B1F6E",
      glow: "rgba(139,92,246,0.25)",
    },
    dark: {
      bg: "#1E1B2E",
      border: "#A78BFA",
      text: "#C4B5FD",
      glow: "rgba(167,139,250,0.30)",
    },
  },
  ac: {
    light: {
      bg: "#F0FDF4",
      border: "#22C55E",
      text: "#14532D",
      glow: "rgba(34,197,94,0.25)",
    },
    dark: {
      bg: "#14291D",
      border: "#4ADE80",
      text: "#BBF7D0",
      glow: "rgba(74,222,128,0.30)",
    },
  },
  evidence: {
    direct: {
      light: {
        bg: "#F0FDF4",
        border: "#16A34A",
        text: "#14532D",
        glow: "rgba(22,163,74,0.25)",
      },
      dark: {
        bg: "#14291D",
        border: "#4ADE80",
        text: "#BBF7D0",
        glow: "rgba(74,222,128,0.30)",
      },
    },
    inferred: {
      light: {
        bg: "#FFFBEB",
        border: "#F59E0B",
        text: "#713F12",
        glow: "rgba(245,158,11,0.25)",
      },
      dark: {
        bg: "#2A2314",
        border: "#FBBF24",
        text: "#FDE68A",
        glow: "rgba(251,191,36,0.30)",
      },
    },
    assumption: {
      light: {
        bg: "#FEF2F2",
        border: "#EF4444",
        text: "#7F1D1D",
        glow: "rgba(239,68,68,0.25)",
      },
      dark: {
        bg: "#2A1515",
        border: "#F87171",
        text: "#FECACA",
        glow: "rgba(248,113,113,0.30)",
      },
    },
  },
  chunk: {
    light: {
      bg: "#F9FAFB",
      border: "#9CA3AF",
      text: "#374151",
      glow: "rgba(156,163,175,0.15)",
    },
    dark: {
      bg: "#1F2937",
      border: "#6B7280",
      text: "#D1D5DB",
      glow: "rgba(107,114,128,0.20)",
    },
  },
  unknown: {
    light: {
      bg: "#F9FAFB",
      border: "#94A3B8",
      text: "#334155",
      glow: "rgba(148,163,184,0.20)",
    },
    dark: {
      bg: "#111827",
      border: "#94A3B8",
      text: "#E5E7EB",
      glow: "rgba(148,163,184,0.25)",
    },
  },
};

export function getNodeTokens(
  nodeType: string,
  theme: GraphTheme,
  confidence?: TraceConfidence
): NodeTokens {
  const dimensions = DIMENSIONS[nodeType] ?? DIMENSIONS.chunk;

  let palette: NodePalette;
  if (nodeType === "evidence" && confidence) {
    palette =
      (PALETTES.evidence as Record<TraceConfidence, Record<GraphTheme, NodePalette>>)[confidence][
        theme
      ];
  } else {
    palette =
      ((PALETTES[nodeType] as Record<GraphTheme, NodePalette>) ?? PALETTES.unknown)[theme] ??
      (PALETTES.unknown as Record<GraphTheme, NodePalette>)[theme];
  }

  return {
    ...palette,
    ...dimensions,
    shadow: {
      idle: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
      hover: "0 4px 12px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)",
      glow: `0 0 16px ${palette.glow}`,
      selected: `0 0 0 2px ${palette.border}, 0 0 20px ${palette.glow}`,
    },
  };
}
