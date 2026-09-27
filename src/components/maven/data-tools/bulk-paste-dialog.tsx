"use client";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { distance } from "fastest-levenshtein";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export interface ColumnMapping {
  key: string;
  label: string;
  synonyms?: string[];
  required?: boolean;
}

export interface BulkPasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetEntityName: string;
  availableColumns: ColumnMapping[];
  onImport: (parsedRows: Record<string, string>[]) => Promise<{ imported: number; errors?: number } | boolean | void>;
}

export function BulkPasteDialog({
  open,
  onOpenChange,
  targetEntityName,
  availableColumns,
  onImport,
}: BulkPasteDialogProps) {
  const [rawText, setRawText] = useState("");
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<{ raw: string; matchedKey: string | null; confidence: number }[]>([]);
  const [step, setStep] = useState<"paste" | "preview">("paste");
  const [loading, setLoading] = useState(false);

  // Normalizasyon: küçük harf, özel karakter temizleme
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9ğüşıöç]/gi, "");

  // Normalize edilmiş Levenshtein benzerlik oranı (0.0 - 1.0)
  const calculateSimilarity = (a: string, b: string): number => {
    const s1 = normalize(a);
    const s2 = normalize(b);
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const d = distance(s1, s2);
    return Math.max(0, 1.0 - d / maxLen);
  };

  const handleParse = () => {
    if (!rawText.trim()) return;
    const lines = rawText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;

    // Ayırıcı tespiti: tab (\t) veya virgül (,)
    const firstLine = lines[0];
    const delimiter = firstLine.includes("\t") ? "\t" : ",";

    const rawHeaders = firstLine.split(delimiter).map((h) => h.replace(/^["']|["']$/g, "").trim());

    // Levenshtein eşleme
    const mappings = rawHeaders.map((rawHeader) => {
      let bestMatch: string | null = null;
      let highestScore = 0;

      for (const col of availableColumns) {
        // Doğrudan label ve key eşleşmesi
        const labelScore = calculateSimilarity(rawHeader, col.label);
        const keyScore = calculateSimilarity(rawHeader, col.key);
        let maxScore = Math.max(labelScore, keyScore);

        // Synonyms kontrolü
        if (col.synonyms) {
          for (const syn of col.synonyms) {
            const synScore = calculateSimilarity(rawHeader, syn);
            if (synScore > maxScore) maxScore = synScore;
          }
        }

        if (maxScore > highestScore) {
          highestScore = maxScore;
          bestMatch = col.key;
        }
      }

      return {
        raw: rawHeader,
        matchedKey: highestScore >= 0.5 ? bestMatch : null,
        confidence: Number(highestScore.toFixed(2)),
      };
    });

    setDetectedHeaders(mappings);

    // Satırları nesneye dönüştür
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(delimiter).map((c) => c.replace(/^["']|["']$/g, "").trim());
      const rowObj: Record<string, string> = {};
      cells.forEach((cell, idx) => {
        const mapping = mappings[idx];
        if (mapping && mapping.matchedKey) {
          rowObj[mapping.matchedKey] = cell;
        }
      });
      if (Object.keys(rowObj).length > 0) {
        rows.push(rowObj);
      }
    }

    setParsedData(rows);
    setStep("preview");
  };

  const handleExecuteImport = async () => {
    if (parsedData.length === 0) return;
    setLoading(true);
    try {
      await onImport(parsedData);
      onOpenChange(false);
      setStep("paste");
      setRawText("");
      setParsedData([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {targetEntityName} — Excel / E-Tablo Toplu Yapıştır
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {step === "paste" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Excel veya Google Sheets'ten başlıklarıyla birlikte kopyaladığınız (Ctrl+C) satırları aşağıdaki alana yapıştırın (Ctrl+V).
                Sütun başlıkları akıllı Levenshtein algoritması ile otomatik eşlenecektir.
              </p>
              <Textarea
                rows={10}
                placeholder={"Ad\tSoyad\tE-posta\tTelefon\tKurum\nAhmet\tYılmaz\tahmet@example.com\t05551234567\tABC Hastanesi"}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="font-mono text-xs bg-muted/20"
              />
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Desteklenen Alanlar:</span>
                {availableColumns.map((c) => (
                  <span key={c.key} className="bg-muted px-1.5 py-0.5 rounded border">
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/10 p-3 space-y-2">
                <p className="text-xs font-semibold">Tespit Edilen Sütun Eşlemeleri:</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {detectedHeaders.map((dh, i) => (
                    <div
                      key={i}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] ${
                        dh.matchedKey ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300" : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40"
                      }`}
                    >
                      {dh.matchedKey ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                      <span className="font-mono font-medium">"{dh.raw}"</span>
                      <span>→</span>
                      <span className="font-semibold">
                        {availableColumns.find((c) => c.key === dh.matchedKey)?.label || "(Eşleşmedi)"}
                      </span>
                      {dh.matchedKey && (
                        <span className="text-[10px] opacity-75">%{Math.round(dh.confidence * 100)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-foreground">
                    Önizleme ({parsedData.length} kayıt aktarılacak):
                  </span>
                </div>
                <div className="max-h-60 overflow-auto border rounded-md text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-muted/70 sticky top-0 border-b">
                      <tr>
                        {availableColumns.map((col) => (
                          <th key={col.key} className="p-2 font-medium">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 15).map((row, i) => (
                        <tr key={i} className="border-b hover:bg-muted/20">
                          {availableColumns.map((col) => (
                            <td key={col.key} className="p-2 truncate max-w-44">
                              {row[col.key] || <span className="text-muted-foreground/40 italic">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedData.length > 15 && (
                  <p className="text-[11px] text-muted-foreground text-center italic">
                    ...ve {parsedData.length - 15} kayıt daha
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t pt-3">
          {step === "preview" && (
            <Button variant="outline" onClick={() => setStep("paste")} disabled={loading} size="sm">
              Geri
            </Button>
          )}
          {step === "paste" ? (
            <Button onClick={handleParse} disabled={!rawText.trim()} size="sm">
              Önizle ve Eşle
            </Button>
          ) : (
            <Button onClick={handleExecuteImport} disabled={loading || parsedData.length === 0} size="sm">
              {loading && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              {loading ? "İçe Aktarılıyor..." : `${parsedData.length} Kaydı İçe Aktar`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
