"use client";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useLang } from "@/lib/i18n";
import {
  calculateWeightedScore,
  recommendDecision,
  detectScoringDiscrepancy,
  checkCoi,
  RubricCriteria,
  ReviewerInfo,
} from "@/lib/scientific/reviewer-engine";
import { Award, CheckCircle2, AlertTriangle, EyeOff, ShieldCheck, Scale } from "lucide-react";

export interface PeerReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: {
    id: string;
    code: string;
    title: string;
    abstract?: string | null;
    anonymizedBody?: string | null;
    authorships?: { name: string; organizationName?: string | null }[];
    reviewAssignments?: {
      id: string;
      reviewer?: { firstName: string; lastName: string } | null;
      reviews?: { score?: number | null }[];
    }[];
  };
  reviewers?: ReviewerInfo[];
  onSubmitReview?: (submissionId: string, rubric: RubricCriteria, comments: string, recommendation: string) => Promise<void>;
}

export function PeerReviewModal({
  open,
  onOpenChange,
  submission,
  onSubmitReview,
}: PeerReviewModalProps) {
  const [rubric, setRubric] = useState<RubricCriteria>({
    originality: 7,
    methodology: 8,
    relevance: 7,
    clarity: 8,
  });
  const { t } = useLang();
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const weightedScore = calculateWeightedScore(rubric);
  const recommendation = recommendDecision(weightedScore);

  // Mevcut hakem puanları arasındaki tutarsızlık kontrolü
  const existingScores = (submission.reviewAssignments ?? [])
    .flatMap((a) => a.reviews ?? [])
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number");

  const allScores = [...existingScores, weightedScore];
  const discrepancy = detectScoringDiscrepancy(allScores);

  const handleSubmit = async () => {
    if (!onSubmitReview) return;
    setSubmitting(true);
    try {
      await onSubmitReview(submission.id, rubric, comments, recommendation.decision);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="size-4 text-primary" />
              Çift-Kör Hakem Değerlendirmesi & Rubrik Puanlama
            </DialogTitle>
            <Badge variant="outline" className="font-mono text-xs">{submission.code}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Çift-Kör Anonimleştirilmiş Bildiri Alanı */}
          <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <EyeOff className="size-3.5 text-muted-foreground" />
                Anonimleştirilmiş Bildiri Görünümü (ICCA Standardı)
              </span>
              <Badge variant="secondary" className="text-[10px]">Yazar & Kurum Gizlendi</Badge>
            </div>
            <h4 className="font-semibold text-sm text-foreground">{submission.title}</h4>
            <p className="text-muted-foreground leading-relaxed">
              {submission.anonymizedBody || submission.abstract || "Bildiri metni bulunamadı."}
            </p>
          </div>

          {/* 4 Boyutlu Rubrik Puanlama */}
          <div className="rounded-xl border p-4 space-y-4 bg-background">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5">
              <Award className="size-4 text-primary" />
              Çoklu Kriter Rubriği (1 - 10 Likert)
            </h4>

            {/* Kriter 1: Özgünlük & Yenilik (%25) */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span>1. Özgünlük & Yenilik (Ağırlık: %25)</span>
                <span className="font-bold text-primary">{rubric.originality} / 10</span>
              </div>
              <Slider
                value={[rubric.originality]}
                min={1}
                max={10}
                step={0.5}
                onValueChange={([val]) => setRubric((prev) => ({ ...prev, originality: val }))}
              />
            </div>

            {/* Kriter 2: Metodolojik Kesinlik & Veri Kalitesi (%35) */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span>2. Metodolojik Kesinlik & Veri Kalitesi (Ağırlık: %35)</span>
                <span className="font-bold text-primary">{rubric.methodology} / 10</span>
              </div>
              <Slider
                value={[rubric.methodology]}
                min={1}
                max={10}
                step={0.5}
                onValueChange={([val]) => setRubric((prev) => ({ ...prev, methodology: val }))}
              />
            </div>

            {/* Kriter 3: Pratik / Klinik İlgi (%25) */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span>3. Pratik / Klinik İlgi (Ağırlık: %25)</span>
                <span className="font-bold text-primary">{rubric.relevance} / 10</span>
              </div>
              <Slider
                value={[rubric.relevance]}
                min={1}
                max={10}
                step={0.5}
                onValueChange={([val]) => setRubric((prev) => ({ ...prev, relevance: val }))}
              />
            </div>

            {/* Kriter 4: Anlatım Netliği (%15) */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span>4. Anlatım Netliği & Sunum (Ağırlık: %15)</span>
                <span className="font-bold text-primary">{rubric.clarity} / 10</span>
              </div>
              <Slider
                value={[rubric.clarity]}
                min={1}
                max={10}
                step={0.5}
                onValueChange={([val]) => setRubric((prev) => ({ ...prev, clarity: val }))}
              />
            </div>

            {/* Ağırlıklı Puan ve Karar Önerisi */}
            <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/10 p-3">
              <div>
                <span className="text-[11px] text-muted-foreground block">Ağırlıklı Rubrik Puanı</span>
                <span className="text-xl font-bold text-primary">{weightedScore.toFixed(2)}</span>
                <span className="text-[11px] text-muted-foreground"> / 10.00</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-muted-foreground block">Sistem Karar Önerisi</span>
                <Badge className="bg-primary text-primary-foreground font-semibold">
                  {recommendation.label}
                </Badge>
              </div>
            </div>

            {/* Tutarsızlık / Aykırı Değer Uyarısı */}
            {discrepancy.hasDiscrepancy && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-900 flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-semibold">Hakem Tutarsızlığı Uyarısı</span>
                  <p className="text-[11px] mt-0.5">{discrepancy.alert}</p>
                </div>
              </div>
            )}
          </div>

          {/* Hakem Görüş & Açıklama */}
          <div className="space-y-1.5">
            <Label>Hakem Değerlendirme Notu / Geri Bildirim</Label>
            <Textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Yazar için yapıcı eleştiriler ve komite için gizli notlar..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Kapat
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("common.saving") : t("peerReview.approveAndSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
