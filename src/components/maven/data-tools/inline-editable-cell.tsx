"use client";
import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

export interface InlineEditableCellProps {
  value: string | number | null | undefined;
  onSave: (nextValue: string) => Promise<boolean>;
  type?: "text" | "number";
  placeholder?: string;
  className?: string;
}

export function InlineEditableCell({
  value,
  onSave,
  type = "text",
  placeholder = "—",
  className = "",
}: InlineEditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentVal, setCurrentVal] = useState(value?.toString() ?? "");
  const [prevValue, setPrevValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // H-13: prop→state eşitleme render sırasında (effect içinde senkron setState yok).
  if (value !== prevValue) {
    setPrevValue(value);
    setCurrentVal(value?.toString() ?? "");
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleCommit = async () => {
    if (currentVal === (value?.toString() ?? "")) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(currentVal);
    setSaving(false);
    if (ok) {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    } else if (e.key === "Escape") {
      setCurrentVal(value?.toString() ?? "");
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className={`cursor-pointer truncate rounded px-1.5 py-0.5 hover:bg-muted/80 transition-colors ${className}`}
        title="Düzenlemek için tıklayın"
      >
        {value !== null && value !== undefined && String(value).trim() !== "" ? (
          <span>{String(value)}</span>
        ) : (
          <span className="text-muted-foreground/60 italic">{placeholder}</span>
        )}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      type={type}
      value={currentVal}
      disabled={saving}
      onChange={(e) => setCurrentVal(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      className={`h-7 text-xs px-1.5 py-0.5 bg-background shadow-xs border-primary/50 ${className}`}
    />
  );
}
