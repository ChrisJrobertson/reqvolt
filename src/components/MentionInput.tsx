"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface MentionOption {
  id: string;
  label: string;
  email?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string, mentions: string[]) => void;
  options: MentionOption[];
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  onSubmit?: () => void;
}

function parseMentions(text: string): string[] {
  const matches = text.matchAll(/@\[([^\]]+)\]\(([^)]+)\)/g);
  const ids: string[] = [];
  for (const m of matches) {
    const id = m[2];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function MentionInput({
  value,
  onChange,
  options,
  placeholder = "Write a comment… Use @ to mention someone",
  minRows = 2,
  disabled = false,
  onSubmit,
}: MentionInputProps) {
  const [cursorPos, setCursorPos] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(
    (o) =>
      o.label.toLowerCase().includes(filter.toLowerCase()) ||
      o.email?.toLowerCase().includes(filter.toLowerCase())
  );

  const insertMention = useCallback(
    (opt: MentionOption) => {
      const before = value.slice(0, cursorPos);
      const after = value.slice(cursorPos);
      const atMatch = before.match(/@(\w*)$/);
      const start = atMatch ? cursorPos - (atMatch[0]?.length ?? 0) : cursorPos;
      const newBefore = value.slice(0, start);
      const mention = `@[${opt.label}](${opt.id})`;
      const newValue = newBefore + mention + (after.startsWith(" ") ? after : " " + after);
      const mentions = parseMentions(newValue);
      onChange(newValue, mentions);
      setShowDropdown(false);
      setFilter("");
      setHighlightIndex(0);
      inputRef.current?.focus();
      const newPos = start + mention.length + 1;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [value, cursorPos, onChange]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showDropdown || filteredOptions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filteredOptions[highlightIndex]) {
        e.preventDefault();
        insertMention(filteredOptions[highlightIndex]!);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showDropdown, filteredOptions, highlightIndex, insertMention]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    const pos = e.target.selectionStart ?? 0;
    setCursorPos(pos);
    const before = v.slice(0, pos);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setShowDropdown(true);
      setFilter(atMatch[1] ?? "");
      setHighlightIndex(0);
    } else {
      setShowDropdown(false);
    }
    const mentions = parseMentions(v);
    onChange(v, mentions);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={(e) => setCursorPos(e.currentTarget.selectionStart ?? 0)}
        placeholder={placeholder}
        rows={minRows}
        disabled={disabled}
        className="w-full px-3 py-2 border rounded-lg text-sm resize-y min-h-[60px] max-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      {showDropdown && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full max-w-xs bg-background border rounded-lg shadow-lg py-1 max-h-40 overflow-y-auto"
        >
          {filteredOptions.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => insertMention(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                i === highlightIndex ? "bg-muted" : ""
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              {opt.email && (
                <span className="text-muted-foreground ml-2 text-xs">{opt.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
