"use client";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isFieldVisible } from "./condition-evaluator";

export interface CustomFieldDef {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  optionsJson?: string | null;
  defaultValue?: string | null;
  isRequired?: boolean;
  groupName?: string | null;
  visibilityRulesJson?: string | null;
}

export interface CustomFieldsRendererProps {
  entityType: string;
  editionId?: string;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  allFormData?: Record<string, any>; // Koşullu mantık için mevcut formun tüm alanları
}

export function CustomFieldsRenderer({
  entityType,
  editionId,
  values,
  onChange,
  allFormData = {},
}: CustomFieldsRendererProps) {
  const [definitions, setDefinitions] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const fetchDefinitions = async () => {
      try {
        const res = await fetch(
          `/api/custom-fields/definitions?entityType=${encodeURIComponent(entityType)}${
            editionId ? `&editionId=${encodeURIComponent(editionId)}` : ""
          }`
        );
        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            setDefinitions(data.definitions || []);
          }
        }
      } catch (err) {
        console.error("CustomFieldsRenderer load error:", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchDefinitions();
    return () => {
      ignore = true;
    };
  }, [entityType, editionId]);

  if (loading) {
    return <div className="text-xs text-muted-foreground py-1">Özel alanlar yükleniyor...</div>;
  }

  if (definitions.length === 0) {
    return null;
  }

  // Birlikte değerlendirilen form context'i (hem core alanlar hem custom alanlar)
  const fullContext = { ...allFormData, ...values };

  // Görünür alanları filtrele
  const visibleFields = definitions.filter((def) =>
    isFieldVisible(def.visibilityRulesJson, fullContext)
  );

  if (visibleFields.length === 0) return null;

  return (
    <div className="space-y-3 pt-2">
      <div className="border-t pt-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Dinamik Ek Alanlar
        </h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleFields.map((def) => {
          const val = values[def.key] ?? def.defaultValue ?? "";

          // SELECT seçenekleri
          let options: string[] = [];
          if (def.optionsJson) {
            try {
              options = JSON.parse(def.optionsJson);
            } catch {
              options = [];
            }
          }

          if (def.fieldType === "BOOLEAN") {
            return (
              <div key={def.id} className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id={`cf_${def.key}`}
                  checked={Boolean(val)}
                  onCheckedChange={(checked) => onChange(def.key, checked)}
                />
                <Label htmlFor={`cf_${def.key}`} className="text-xs font-normal cursor-pointer">
                  {def.label} {def.isRequired && <span className="text-destructive">*</span>}
                </Label>
              </div>
            );
          }

          if (def.fieldType === "SELECT") {
            return (
              <div key={def.id} className="space-y-1">
                <Label className="text-xs">
                  {def.label} {def.isRequired && <span className="text-destructive">*</span>}
                </Label>
                <Select value={String(val || "")} onValueChange={(next) => onChange(def.key, next)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seçiniz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((opt, i) => (
                      <SelectItem key={i} value={opt} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          }

          if (def.fieldType === "TEXTAREA") {
            return (
              <div key={def.id} className="col-span-full space-y-1">
                <Label className="text-xs">
                  {def.label} {def.isRequired && <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  rows={2}
                  value={String(val)}
                  onChange={(e) => onChange(def.key, e.target.value)}
                  className="text-xs"
                />
              </div>
            );
          }

          return (
            <div key={def.id} className="space-y-1">
              <Label className="text-xs">
                {def.label} {def.isRequired && <span className="text-destructive">*</span>}
              </Label>
              <Input
                type={def.fieldType === "NUMBER" ? "number" : def.fieldType === "DATE" ? "date" : "text"}
                value={String(val)}
                onChange={(e) =>
                  onChange(
                    def.key,
                    def.fieldType === "NUMBER" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                  )
                }
                className="h-8 text-xs"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
