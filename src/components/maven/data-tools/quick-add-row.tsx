"use client";
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n";

export interface QuickAddColumnConfig {
  key: string;
  placeholder: string;
  type?: "text" | "number";
  width?: string;
}

export interface QuickAddRowProps {
  columns: QuickAddColumnConfig[];
  onAdd: (data: Record<string, string>) => Promise<boolean>;
  buttonLabel?: string;
}

export function QuickAddRow({ columns, onAdd, buttonLabel }: QuickAddRowProps) {
  const { t } = useLang();
  const label = buttonLabel ?? t("quickAdd.add");
  const [rowState, setRowState] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (key: string, val: string) => {
    setRowState((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async () => {
    const hasValue = Object.values(rowState).some((v) => v && v.trim().length > 0);
    if (!hasValue) return;

    setSubmitting(true);
    try {
      const success = await onAdd(rowState);
      if (success) {
        setRowState({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t bg-muted/30 p-2 text-xs rounded-b-md"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-1 items-center gap-2 min-w-56">
        {columns.map((col) => (
          <Input
            key={col.key}
            type={col.type || "text"}
            placeholder={col.placeholder}
            value={rowState[col.key] || ""}
            onChange={(e) => handleChange(col.key, e.target.value)}
            disabled={submitting}
            className={`h-8 text-xs bg-background ${col.width || "flex-1"}`}
          />
        ))}
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={submitting}
        className="h-8 gap-1 text-xs shrink-0 cursor-pointer"
      >
        {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        {label}
      </Button>
    </div>
  );
}
