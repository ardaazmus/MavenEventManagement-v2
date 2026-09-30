"use client";
// F3-a: ⌘K komut paleti — cmdk tabanlı; girdiler menüyle aynı iki kapıdan süzülür
// (yetenek + rol). Seçim setModule(id) ile mevcut modüle gider; kilitli modüller
// listede görünmez (menü paritesi).
import { Command } from "cmdk";
import * as Icons from "lucide-react";
import { MODULE_GROUPS } from "@/lib/constants";
import { useLang } from "@/lib/i18n";
import type { CommandEntry } from "@/lib/constants";

export function CommandPalette({ open, onOpenChange, entries, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: CommandEntry[];
  onSelect: (id: string) => void;
}) {
  const { t } = useLang();
  const groups = MODULE_GROUPS
    .map((g) => ({ ...g, items: entries.filter((e) => e.group === g.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("commandPalette.title")}
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[16%] z-50 w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none"
    >
      <div className="flex items-center gap-2 border-b px-3.5">
        <Icons.Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Command.Input
          autoFocus
          aria-label={t("commandPalette.placeholder")}
          placeholder={t("commandPalette.placeholder")}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground md:inline">ESC</kbd>
      </div>
      <Command.List className="maven-scroll max-h-[22rem] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">{t("commandPalette.empty")}</Command.Empty>
        {groups.map((g) => {
          const GroupIcon = (Icons as unknown as Record<string, Icons.LucideIcon>)[g.icon] ?? Icons.Circle;
          return (
            <Command.Group
              key={g.id}
              heading={
                <span className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <GroupIcon className="size-3" aria-hidden /> {t(g.labelKey)}
                </span>
              }
            >
              {g.items.map((e) => {
                const ModuleIcon = (Icons as unknown as Record<string, Icons.LucideIcon>)[e.icon] ?? Icons.Circle;
                const labelText = t(`modules.${e.id}`);
                return (
                  <Command.Item
                    key={e.id}
                    value={`${labelText} ${e.id}`}
                    onSelect={() => onSelect(e.id)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <ModuleIcon className="size-4 shrink-0 text-primary/80" aria-hidden />
                    <span className="truncate">{labelText}</span>
                    <Icons.CornerDownLeft className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                  </Command.Item>
                );
              })}
            </Command.Group>
          );
        })}
      </Command.List>
      <div className="border-t px-3.5 py-2 text-[10px] text-muted-foreground">{t("commandPalette.hint")}</div>
    </Command.Dialog>
  );
}
