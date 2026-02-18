"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) {
    return (
      <div
        className="h-9 w-9 rounded-md bg-muted"
        aria-hidden
      />
    );
  }

  const cycleTheme = () => {
    if (theme === "system") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("system");
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      suppressHydrationWarning
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      title={
        theme === "system"
          ? "System theme"
          : theme === "light"
            ? "Light mode"
            : "Dark mode"
      }
      aria-label={`Theme: ${theme ?? "system"}. Click to cycle.`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
