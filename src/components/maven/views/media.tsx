"use client";
// Medya Arşivi — klasör mimarisi + etkinlik içi izolasyon (düşünce bulutu 3)
// İki panelli: solda klasör ağacı (self-ref parentId), sağda varlık ızgarası + yükleme/detay.
import { useEffect, useMemo, useRef, useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { PageHeader, SectionCard, EmptyState, Loading, ErrorState, useApi, Chip, KpiCard } from "../bits";
import { MEDIA_KIND, label } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";

interface MediaFolderRow {
  id: string; editionId: string; parentId?: string | null; name: string; color?: string | null;
  systemKey?: string | null; description?: string | null; createdAt: string;
}
interface MediaAssetRow {
  id: string; editionId: string; folderId?: string | null; name: string; kind: string; mimeType?: string | null;
  sizeKb?: number | null; externalUrl?: string | null; dataUrl?: string | null; tags?: string | null;
  notes?: string | null; linkedType?: string | null; linkedId?: string | null; uploadedBy?: string | null; createdAt: string;
}
interface FolderNode { folder: MediaFolderRow; children: FolderNode[]; count: number; depth: number }

// klasör renk dili — nokta + seçili zemin
const FOLDER_COLORS: Record<string, { dot: string; active: string }> = {
  teal: { dot: "bg-teal-500", active: "border-teal-300 bg-teal-500/10 text-teal-900" },
  amber: { dot: "bg-amber-500", active: "border-amber-300 bg-amber-500/10 text-amber-900" },
  violet: { dot: "bg-violet-500", active: "border-violet-300 bg-violet-500/10 text-violet-900" },
  rose: { dot: "bg-rose-500", active: "border-rose-300 bg-rose-500/10 text-rose-900" },
  emerald: { dot: "bg-emerald-500", active: "border-emerald-300 bg-emerald-500/10 text-emerald-900" },
  neutral: { dot: "bg-neutral-400", active: "border-neutral-300 bg-muted text-foreground" },
};
const COLOR_PALETTE = ["teal", "amber", "violet", "rose", "emerald", "neutral"];

const SYSTEM_ICON: Record<string, keyof typeof Icons> = { PHOTOS: "Camera", LOGOS: "PenTool", DOCUMENTS: "FileStack", PRESENTATIONS: "Presentation", VIDEOS: "Clapperboard" };

const KIND_ICON: Record<string, keyof typeof Icons> = {
  IMAGE: "Image", VIDEO: "Clapperboard", AUDIO: "AudioLines", DOCUMENT: "FileText",
  SPREADSHEET: "Sheet", ARCHIVE: "Archive", FONT: "Type", OTHER: "File",
};
const KIND_TONE: Record<string, string> = {
  IMAGE: "bg-teal-500/10 text-teal-600", VIDEO: "bg-violet-500/10 text-violet-600",
  AUDIO: "bg-amber-500/10 text-amber-600", DOCUMENT: "bg-rose-500/10 text-rose-600",
  SPREADSHEET: "bg-emerald-500/10 text-emerald-600", ARCHIVE: "bg-neutral-500/10 text-neutral-600",
  FONT: "bg-violet-500/10 text-violet-600", OTHER: "bg-muted text-muted-foreground",
};

const MAX_DATAURL_KB = 400;

function fmtSize(sizeKb?: number | null): string {
  if (!sizeKb) return "—";
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1).replace(".", ",")} MB` : `${sizeKb} KB`;
}

// mime → MEDIA_KIND (uzantı yedeğiyle)
function kindFromMime(mime: string, fileName: string): string {
  const m = (mime || "").toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/")) return "IMAGE";
  if (m.startsWith("video/")) return "VIDEO";
  if (m.startsWith("audio/")) return "AUDIO";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("csv")) return "SPREADSHEET";
  if (m.includes("pdf") || m.includes("word") || m.includes("presentation") || m.startsWith("text/")) return "DOCUMENT";
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || m.includes("rar") || m.includes("7z") || m.includes("octet-stream")) return "ARCHIVE";
  if (m.startsWith("font/")) return "FONT";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "IMAGE";
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "VIDEO";
  if (["mp3", "wav", "m4a", "aac"].includes(ext)) return "AUDIO";
  if (["pdf", "doc", "docx", "ppt", "pptx", "txt", "md"].includes(ext)) return "DOCUMENT";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "SPREADSHEET";
  if (["zip", "rar", "7z", "tar", "gz", "dwg"].includes(ext)) return "ARCHIVE";
  if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "FONT";
  return "OTHER";
}

export function MediaArchiveView() {
  const { currentEditionId, editions, bump, refreshKey } = useApp();
  const { toast } = useToast();

  const { data: folders, error: foldersError, reload: reloadFolders, loading: foldersLoading } = useApi<MediaFolderRow[]>(
    () => listEntity<MediaFolderRow>("media-folders", { editionId: currentEditionId ?? undefined }),
    [currentEditionId, refreshKey],
  );
  const { data: assets, error: assetsError, reload: reloadAssets, loading: assetsLoading } = useApi<MediaAssetRow[]>(
    () => listEntity<MediaAssetRow>("media-assets", { editionId: currentEditionId ?? undefined, limit: 500 }),
    [currentEditionId, refreshKey],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null); // null = "Tümü"
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initExpanded = useRef(false);
  useEffect(() => {
    if (folders && !initExpanded.current) {
      setExpanded(new Set(folders.map((f) => f.id)));
      initExpanded.current = true;
    }
  }, [folders]);

  const [search, setSearch] = useState("");

  // ── diyaloklar
  const [folderDialog, setFolderDialog] = useState<{ mode: "create" | "edit"; parent: MediaFolderRow | null; target?: MediaFolderRow } | null>(null);
  const [folderForm, setFolderForm] = useState({ name: "", color: "teal" });
  const [deleteFolder, setDeleteFolder] = useState<MediaFolderRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "link">("file");
  const [uploadForm, setUploadForm] = useState({ name: "", kind: "OTHER", folderId: "__none__", tags: "", notes: "", externalUrl: "", dataUrl: "", mimeType: "", sizeKb: 0 });
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<MediaAssetRow | null>(null);
  const [detailForm, setDetailForm] = useState({ tags: "", notes: "", folderId: "__none__" });

  const editionName = editions.find((e) => e.id === currentEditionId)?.name ?? "bu etkinliğin";

  // ── klasör ağacı (parentId → self-ref) + klasör başına varlık sayısı
  const tree = useMemo<FolderNode[]>(() => {
    const list = folders ?? [];
    const byId = new Map<string, FolderNode>();
    for (const f of list) byId.set(f.id, { folder: f, children: [], count: 0, depth: 0 });
    const roots: FolderNode[] = [];
    for (const node of byId.values()) {
      const parent = node.folder.parentId ? byId.get(node.folder.parentId) : undefined;
      if (parent) { parent.children.push(node); node.depth = parent.depth + 1; } else roots.push(node);
    }
    const counts = new Map<string, number>();
    for (const a of assets ?? []) {
      if (a.folderId) counts.set(a.folderId, (counts.get(a.folderId) ?? 0) + 1);
    }
    const walk = (n: FolderNode): number => {
      n.count = counts.get(n.folder.id) ?? 0;
      for (const c of n.children) n.count += walk(c);
      return n.count;
    };
    roots.forEach(walk);
    const sortRec = (nodes: FolderNode[]) => {
      nodes.sort((a, b) => a.folder.name.localeCompare(b.folder.name, "tr"));
      nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  }, [folders, assets]);

  // seçili klasörün alt dahil tüm varlıkları (klasör = kendi + torunları)
  const descendantIds = useMemo(() => {
    const scope = new Set<string>();
    if (!selectedId) return scope; // boş = tümü
    const walk = (n: FolderNode): boolean => {
      if (n.folder.id === selectedId) {
        const collect = (m: FolderNode) => { scope.add(m.folder.id); m.children.forEach(collect); };
        collect(n);
        return true;
      }
      return n.children.some(walk);
    };
    tree.forEach((n) => walk(n));
    return scope;
  }, [tree, selectedId]);

  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assets ?? []).filter((a) => {
      if (selectedId && !descendantIds.has(a.folderId ?? "")) return false;
      if (!q) return true;
      return (a.name ?? "").toLowerCase().includes(q) || (a.tags ?? "").toLowerCase().includes(q);
    });
  }, [assets, search, selectedId, descendantIds]);

  const flatFolders = useMemo(() => {
    const out: { f: MediaFolderRow; depth: number }[] = [];
    const walk = (n: FolderNode) => { out.push({ f: n.folder, depth: n.depth }); n.children.forEach(walk); };
    tree.forEach(walk);
    return out;
  }, [tree]);

  const imageCount = (assets ?? []).filter((a) => a.kind === "IMAGE").length;
  const videoCount = (assets ?? []).filter((a) => a.kind === "VIDEO").length;
  const selectedFolder = (folders ?? []).find((f) => f.id === selectedId) ?? null;

  // ── aksiyonlar
  const toggleExpand = (id: string) => {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const saveFolder = async () => {
    if (!folderDialog || !folderForm.name.trim() || !currentEditionId) return;
    setBusy(true);
    try {
      if (folderDialog.mode === "create") {
        await apiSend("/api/media-folders", "POST", {
          editionId: currentEditionId, parentId: folderDialog.parent?.id ?? null,
          name: folderForm.name.trim(), color: folderForm.color,
        });
        toast({ title: "Klasör eklendi", description: `"${folderForm.name.trim()}" ağaca yerleşti.` });
      } else if (folderDialog.target) {
        await apiSend(`/api/media-folders/${folderDialog.target.id}`, "PUT", { name: folderForm.name.trim(), color: folderForm.color });
        toast({ title: "Klasör güncellendi" });
      }
      setFolderDialog(null);
      reloadFolders(); bump();
    } catch (e) {
      toast({ title: "Klasör kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const removeFolder = async () => {
    if (!deleteFolder) return;
    setBusy(true);
    try {
      await apiSend(`/api/media-folders/${deleteFolder.id}`, "DELETE");
      toast({ title: "Klasör silindi", description: "İçindeki varlıklar silinmedi — klasörsüz olarak 'Tümü' altında kalır." });
      if (selectedId === deleteFolder.id) setSelectedId(null);
      setDeleteFolder(null);
      reloadFolders(); reloadAssets(); bump();
    } catch (e) {
      toast({ title: "Silinemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const onPickFile = (file: File) => {
    const kind = kindFromMime(file.type, file.name);
    const sizeKb = Math.round(file.size / 1024);
    setUploadForm((prev) => ({
      ...prev,
      name: prev.name || file.name.replace(/\.[^.]+$/, ""),
      kind,
      mimeType: file.type || "application/octet-stream",
      sizeKb,
      dataUrl: "",
    }));
    if (file.size <= MAX_DATAURL_KB * 1024) {
      const reader = new FileReader();
      reader.onload = () => setUploadForm((prev) => ({ ...prev, dataUrl: typeof reader.result === "string" ? reader.result : "" }));
      reader.readAsDataURL(file);
    } else {
      toast({ title: "Dosya 400KB sınırı aşılıyor", description: "400KB üstü dosyalar için bağlantı modunu kullanın — bağlantı ekleme moduna geçildi.", variant: "destructive" });
      setUploadMode("link");
    }
  };

  const uploadAsset = async () => {
    if (!uploadForm.name.trim() || !currentEditionId) return;
    if (uploadMode === "link" && !uploadForm.externalUrl.trim()) return;
    setBusy(true);
    try {
      await apiSend("/api/media-assets", "POST", {
        editionId: currentEditionId,
        folderId: uploadForm.folderId === "__none__" ? null : uploadForm.folderId,
        name: uploadForm.name.trim(), kind: uploadForm.kind,
        mimeType: uploadForm.mimeType || null,
        sizeKb: uploadForm.sizeKb || null,
        externalUrl: uploadMode === "link" ? uploadForm.externalUrl.trim() : null,
        dataUrl: uploadMode === "file" && uploadForm.dataUrl ? uploadForm.dataUrl : null,
        tags: uploadForm.tags.trim() || null,
        notes: uploadForm.notes.trim() || null,
        uploadedBy: "Yönetici",
      });
      toast({ title: "Varlık arşive eklendi", description: `${uploadForm.name.trim()} · ${label(MEDIA_KIND, uploadForm.kind)}` });
      setUploadOpen(false);
      setUploadForm({ name: "", kind: "OTHER", folderId: selectedId ?? "__none__", tags: "", notes: "", externalUrl: "", dataUrl: "", mimeType: "", sizeKb: 0 });
      reloadAssets(); bump();
    } catch (e) {
      toast({ title: "Yüklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openDetail = (a: MediaAssetRow) => {
    setDetail(a);
    setDetailForm({ tags: a.tags ?? "", notes: a.notes ?? "", folderId: a.folderId ?? "__none__" });
  };

  const saveDetail = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await apiSend(`/api/media-assets/${detail.id}`, "PUT", {
        tags: detailForm.tags.trim() || null,
        notes: detailForm.notes.trim() || null,
        folderId: detailForm.folderId === "__none__" ? null : detailForm.folderId,
      });
      toast({ title: "Varlık güncellendi", description: detailForm.folderId !== detail.folderId ? "Varlık taşındı." : "Etiket/not kaydedildi." });
      setDetail(null);
      reloadAssets(); bump();
    } catch (e) {
      toast({ title: "Kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const deleteAsset = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await apiSend(`/api/media-assets/${detail.id}`, "DELETE");
      toast({ title: "Varlık arşivden kaldırıldı", description: "Bu bir arşiv kaydıdır — kaynak depodaki dosyayı etkilemez." });
      setDetail(null);
      reloadAssets(); bump();
    } catch (e) {
      toast({ title: "Silinemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (foldersLoading && !folders) return <Loading rows={6} />;
  if (foldersError) return <ErrorState message={foldersError} onRetry={reloadFolders} />;

  // ── klasör ağacı satırı
  const renderNode = (node: FolderNode) => {
    const f = node.folder;
    const isOpen = expanded.has(f.id);
    const color = FOLDER_COLORS[f.color ?? "neutral"] ?? FOLDER_COLORS.neutral;
    const isActive = selectedId === f.id;
    const SysIcon = f.systemKey && SYSTEM_ICON[f.systemKey] ? (Icons[SYSTEM_ICON[f.systemKey]] as typeof Icons.Folder) : null;
    return (
      <div key={f.id} className="animate-in fade-in slide-in-from-left-1 fill-mode-backwards" style={{ animationDelay: `${Math.min(node.depth, 4) * 30}ms` }}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-lg border border-transparent px-1.5 py-1 transition-colors hover:bg-muted/60",
            isActive && cn("border", color.active),
          )}
        >
          <button
            type="button"
            onClick={() => toggleExpand(f.id)}
            aria-label={isOpen ? "Klasörü daralt" : "Klasörü genişlet"}
            className={cn("grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted", !node.children.length && "invisible")}
          >
            {isOpen ? <Icons.ChevronDown className="size-3.5" /> : <Icons.ChevronRight className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setSelectedId(f.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left"
            aria-current={isActive ? "true" : undefined}
          >
            <span className={cn("size-2 shrink-0 rounded-full", color.dot)} aria-hidden />
            {SysIcon
              ? <SysIcon className="size-3.5 shrink-0 text-muted-foreground" />
              : (isOpen && node.children.length ? <Icons.FolderOpen className="size-3.5 shrink-0 text-muted-foreground" /> : <Icons.Folder className="size-3.5 shrink-0 text-muted-foreground" />)}
            <span className="truncate text-[13px] font-medium">{f.name}</span>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{node.count}</span>
          </button>
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <TooltipLite label="Alt klasör ekle">
              <button type="button" aria-label="Alt klasör ekle" onClick={() => { setFolderDialog({ mode: "create", parent: f }); setFolderForm({ name: "", color: f.color ?? "teal" }); }} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                <Icons.Plus className="size-3" />
              </button>
            </TooltipLite>
            <TooltipLite label="Yeniden adlandır">
              <button type="button" aria-label="Klasörü yeniden adlandır" onClick={() => { setFolderDialog({ mode: "edit", parent: null, target: f }); setFolderForm({ name: f.name, color: f.color ?? "teal" }); }} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                <Icons.Pencil className="size-3" />
              </button>
            </TooltipLite>
            <TooltipLite label="Klasörü sil">
              <button type="button" aria-label="Klasörü sil" onClick={() => setDeleteFolder(f)} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-rose-50 hover:text-rose-600">
                <Icons.Trash2 className="size-3" />
              </button>
            </TooltipLite>
          </div>
        </div>
        {isOpen && node.children.length > 0 && (
          <div className="ml-[13px] border-l pl-1.5">{node.children.map(renderNode)}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Medya Arşivi" desc="Klasör mimarisi ve etkinlik içi izolasyon — her varlık kendi edisyonunda arşivlenir.">
        <Button variant="outline" size="sm" onClick={() => { setFolderDialog({ mode: "create", parent: selectedFolder }); setFolderForm({ name: "", color: "teal" }); }}>
          <Icons.FolderPlus className="size-4" /> Yeni Klasör
        </Button>
        <Button size="sm" onClick={() => { setUploadMode("file"); setUploadForm({ name: "", kind: "OTHER", folderId: selectedId ?? "__none__", tags: "", notes: "", externalUrl: "", dataUrl: "", mimeType: "", sizeKb: 0 }); setUploadOpen(true); }}>
          <Icons.Upload className="size-4" /> Varlık Yükle
        </Button>
      </PageHeader>

      {/* Üst KPI şeridi + etkinlik izolasyonu */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="teal"><Icons.ShieldCheck className="mr-1 inline size-3" /> Bu arşiv yalnızca {editionName} verilerini içerir — etkinlik izolasyonu</Chip>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Toplam Varlık" value={(assets ?? []).length} icon={<Icons.Files className="size-4" />} />
        <KpiCard label="Görsel" value={imageCount} tone="teal" icon={<Icons.Image className="size-4" />} />
        <KpiCard label="Video" value={videoCount} tone="violet" icon={<Icons.Clapperboard className="size-4" />} />
        <KpiCard label="Klasör" value={(folders ?? []).length} tone="amber" icon={<Icons.FolderOpen className="size-4" />} />
      </div>

      {/* İki panel — lg altında üst üste */}
      <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* SOL: klasör ağacı */}
        <SectionCard
          title="Klasörler"
          desc="iç içe mimari — seçili: Tümü"
          className="lg:sticky lg:top-4"
          action={<button type="button" aria-label="Kök klasör ekle" onClick={() => { setFolderDialog({ mode: "create", parent: null }); setFolderForm({ name: "", color: "teal" }); }} className="grid size-7 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Icons.Plus className="size-3.5" /></button>}
        >
          <div className="maven-scroll max-h-96 space-y-0.5 overflow-y-auto pr-1 lg:max-h-[480px]">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-[13px] font-medium transition-colors hover:bg-muted/60",
                !selectedId && "border-teal-300 bg-teal-500/10 text-teal-900",
              )}
            >
              <Icons.Library className="size-3.5 text-muted-foreground" />
              Tümü
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{(assets ?? []).length}</span>
            </button>
            {tree.map(renderNode)}
            {(folders ?? []).length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">Henüz klasör yok — sağ üstten ilk klasörü ekleyin.</p>
            )}
          </div>
        </SectionCard>

        {/* SAĞ: varlık ızgarası */}
        <SectionCard
          title={selectedFolder ? selectedFolder.name : "Tüm Varlıklar"}
          desc={selectedFolder
            ? (selectedFolder.description ?? `${selectedFolder.systemKey ? "sistem klasörü · " : ""}klasör içeriği`)
            : "tüm klasörler ve klasörsüz varlıklar"}
          action={
            <div className="relative">
              <Icons.Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad veya etiket ara…" className="h-8 w-44 pl-8 text-xs sm:w-56" aria-label="Varlık ara" />
            </div>
          }
        >
          {assetsLoading && !assets ? <Loading rows={3} /> : assetsError ? <ErrorState message={assetsError} onRetry={reloadAssets} /> : visibleAssets.length === 0 ? (
            <EmptyState
              title={search ? "Aramaya uyan varlık yok" : "Bu klasörde varlık yok"}
              desc={search ? "Farklı bir ad/etiket deneyin." : "'Varlık Yükle' ile dosya bağlantısı ekleyin ya da küçük dosyaları doğrudan arşive gömün."}
            />
          ) : (
            <div className="maven-scroll grid max-h-[520px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {visibleAssets.map((a, i) => {
                const KIcon = (Icons[KIND_ICON[a.kind] ?? "File"] as typeof Icons.File);
                const tagList = (a.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openDetail(a)}
                    className="group animate-in flex flex-col gap-2 rounded-xl border bg-card p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md fade-in slide-in-from-bottom-1 fill-mode-backwards focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110", KIND_TONE[a.kind] ?? KIND_TONE.OTHER)}>
                        <KIcon className="size-4" />
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label(MEDIA_KIND, a.kind)}</span>
                    </div>
                    <p className="truncate text-[13px] font-semibold" title={a.name}>{a.name}</p>
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{fmtSize(a.sizeKb)}</span>
                      {a.uploadedBy && <span>· {a.uploadedBy}</span>}
                      {a.linkedType && <Chip tone="violet">{a.linkedType}</Chip>}
                    </div>
                    {tagList.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tagList.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}
                        {tagList.length > 3 && <Chip>+{tagList.length - 3}</Chip>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Klasör ekle/düzenle diyaloğu */}
      <Dialog open={Boolean(folderDialog)} onOpenChange={(o) => !o && setFolderDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{folderDialog?.mode === "edit" ? "Klasörü Yeniden Adlandır" : "Alt Klasör Ekle"}</DialogTitle>
            <DialogDescription>
              {folderDialog?.mode === "edit"
                ? (folderDialog?.target?.name ?? "")
                : `Üst klasör: ${folderDialog?.parent?.name ?? "Tümü (kök)"}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="folder-name">Klasör adı</Label>
              <Input id="folder-name" value={folderForm.name} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} placeholder="örn. 2027 Basın Kiti" />
            </div>
            <div className="space-y-1.5">
              <Label>Renk</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Renk: ${c}`}
                    aria-pressed={folderForm.color === c}
                    onClick={() => setFolderForm({ ...folderForm, color: c })}
                    className={cn(
                      "grid size-8 place-items-center rounded-lg border transition-all",
                      folderForm.color === c ? "border-foreground/40 ring-2 ring-ring/40" : "border-transparent hover:border-border",
                    )}
                  >
                    <span className={cn("size-4 rounded-full", FOLDER_COLORS[c].dot)} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(null)}>Vazgeç</Button>
            <Button onClick={saveFolder} disabled={busy || !folderForm.name.trim()}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Klasör silme onayı — varlıklar klasörsüz kalır */}
      <AlertDialog open={Boolean(deleteFolder)} onOpenChange={(o) => !o && setDeleteFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>"{deleteFolder?.name}" silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Klasör ağaçtan kaldırılır. İçindeki varlıklar <b>silinmez</b> — klasörsüz olarak &quot;Tümü&quot; altında arşivlenmeye devam eder. Alt klasörler de silinir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={removeFolder} className="bg-rose-600 text-white hover:bg-rose-700">{busy ? "Siliniyor…" : "Klasörü Sil"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Yükleme diyaloğu — dosya gömme / bağlantı ekleme */}
      <Dialog open={uploadOpen} onOpenChange={(o) => !o && setUploadOpen(false)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Varlık Yükle</DialogTitle>
            <DialogDescription>
              ≤400KB dosyalar arşive gömülür (dataURL); büyük dosyalar için bağlantı ekleyin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Yükleme modu">
              {(["file", "link"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={uploadMode === m}
                  onClick={() => setUploadMode(m)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    uploadMode === m ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "file" ? <><Icons.HardDriveUpload className="size-3.5" /> Dosya yükle</> : <><Icons.Link2 className="size-3.5" /> Bağlantı ekle</>}
                </button>
              ))}
            </div>

            {uploadMode === "file" ? (
              <div className="space-y-1.5">
                <Label htmlFor="asset-file">Dosya seç</Label>
                <Input
                  id="asset-file"
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.zip,.rar,.7z,.dwg,.ttf,.otf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }}
                  className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  {uploadForm.sizeKb > 0 && <>Seçildi: {fmtSize(uploadForm.sizeKb)} · {uploadForm.mimeType} · {uploadForm.dataUrl ? "arşive gömülecek ✓" : "bağlantı modu önerilir"}</>}
                  {uploadForm.sizeKb === 0 && "Görsel, video, belge, arşiv — mime tipinden tür otomatik tanınır."}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="asset-url">Dış bağlantı</Label>
                <Input id="asset-url" value={uploadForm.externalUrl} onChange={(e) => setUploadForm({ ...uploadForm, externalUrl: e.target.value })} placeholder="https://assets.ornek.com/dosya.pdf" />
                <p className="text-[11px] text-muted-foreground">CDN, bulut depolama veya varsa kurum sunucusu adresi.</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="asset-name">Ad</Label>
                <Input id="asset-name" value={uploadForm.name} onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })} placeholder="dosya adından otomatik" />
              </div>
              <div className="space-y-1.5">
                <Label>Tür</Label>
                <Select value={uploadForm.kind} onValueChange={(v) => setUploadForm({ ...uploadForm, kind: v })}>
                  <SelectTrigger aria-label="Varlık türü"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MEDIA_KIND).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Klasör</Label>
                <Select value={uploadForm.folderId} onValueChange={(v) => setUploadForm({ ...uploadForm, folderId: v })}>
                  <SelectTrigger aria-label="Hedef klasör"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Klasörsüz (Tümü)</SelectItem>
                    {flatFolders.map(({ f, depth }) => (
                      <SelectItem key={f.id} value={f.id}>{depth > 0 ? `${"— ".repeat(depth)}${f.name}` : f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-tags">Etiketler</Label>
                <Input id="asset-tags" value={uploadForm.tags} onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })} placeholder="virgülle: logo, basın" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="asset-notes">Notlar</Label>
                <Textarea id="asset-notes" value={uploadForm.notes} onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })} rows={2} placeholder="kullanım amacı, lisans, telif…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Vazgeç</Button>
            <Button onClick={uploadAsset} disabled={busy || !uploadForm.name.trim() || (uploadMode === "link" && !uploadForm.externalUrl.trim())}>
              {busy ? "Ekleniyor…" : "Arşive Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Varlık detay diyaloğu */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              {(() => { const KIcon = (Icons[KIND_ICON[detail?.kind ?? "OTHER"] ?? "File"] as typeof Icons.File); return <KIcon className="size-4 text-muted-foreground" />; })()}
              <span className="truncate">{detail?.name}</span>
            </DialogTitle>
            <DialogDescription>{label(MEDIA_KIND, detail?.kind)} · {fmtSize(detail?.sizeKb)}{detail?.uploadedBy ? ` · ${detail.uploadedBy}` : ""}{detail?.createdAt ? ` · ${new Date(detail.createdAt).toLocaleDateString("tr-TR")}` : ""}</DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              {/* önizleme */}
              <div className="grid min-h-36 place-items-center overflow-hidden rounded-lg border bg-muted/30 p-3">
                {detail.dataUrl && detail.dataUrl.startsWith("data:image") ? (
                  <img src={detail.dataUrl} alt={detail.name} className="max-h-64 rounded object-contain" />
                ) : detail.kind === "IMAGE" && detail.externalUrl ? (
                  <ExternalImage src={detail.externalUrl} alt={detail.name} />
                ) : detail.dataUrl && detail.dataUrl.startsWith("data:") ? (
                  <a href={detail.dataUrl} download={detail.name} className="flex flex-col items-center gap-2 text-xs font-medium text-teal-700 hover:underline">
                    <Icons.FileDown className="size-8" /> Gömülü dosyayı indir
                  </a>
                ) : detail.externalUrl ? (
                  detail.kind === "VIDEO" ? (
                    <a href={detail.externalUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-xs font-medium text-violet-700 hover:underline">
                      <Icons.Clapperboard className="size-8" /> Videoyu dış bağlantıda aç
                    </a>
                  ) : (
                    <a href={detail.externalUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-xs font-medium text-teal-700 hover:underline">
                      <Icons.FileDown className="size-8" /> Belgeyi indir / aç
                    </a>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                    <Icons.FileQuestion className="size-8" />
                    <span className="text-xs">Önizleme yok — gömülü içerik veya bağlantı ekleyin</span>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="detail-folder">Klasöre taşı</Label>
                  <Select value={detailForm.folderId} onValueChange={(v) => setDetailForm({ ...detailForm, folderId: v })}>
                    <SelectTrigger aria-label="Klasör seç"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Klasörsüz (Tümü)</SelectItem>
                      {flatFolders.map(({ f, depth }) => (
                        <SelectItem key={f.id} value={f.id}>{depth > 0 ? `${"— ".repeat(depth)}${f.name}` : f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="detail-tags">Etiketler</Label>
                  <Input id="detail-tags" value={detailForm.tags} onChange={(e) => setDetailForm({ ...detailForm, tags: e.target.value })} placeholder="virgülle ayırın" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="detail-notes">Notlar</Label>
                  <Textarea id="detail-notes" value={detailForm.notes} onChange={(e) => setDetailForm({ ...detailForm, notes: e.target.value })} rows={2} />
                </div>
              </div>

              {detail.externalUrl && (
                <p className="truncate rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" title={detail.externalUrl}>
                  <Icons.Link2 className="mr-1 inline size-3" />{detail.externalUrl}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={deleteAsset} disabled={busy} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              <Icons.Trash2 className="size-4" /> Sil
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDetail(null)}>Vazgeç</Button>
              <Button onClick={saveDetail} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// dış görsel önizleme — yüklenemezse ikon yedeğine düşer
function ExternalImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
        <Icons.ImageOff className="size-8" />
        <span className="text-xs">Görsel önizlenemedi — bağlantıyı kontrol edin</span>
      </div>
    );
  }
  return (
    <img src={src} alt={alt} onError={() => setFailed(true)} className="max-h-64 rounded object-contain" />
  );
}

// minik tooltip sarıcısı (ağaç aksiyon butonları için)
function TooltipLite({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
