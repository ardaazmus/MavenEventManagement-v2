"use client";
// H-05: Üst şirket kullanıcı yönetimi kartı (Ayarlar → GRUP 1).
// Liste (GET /api/users) · davet (POST /api/users/invites) · rol ata/kaldır
// (POST/DELETE /api/users/[id]/roles) · etkinleştir/devre-dışı (PATCH status).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { apiGet, apiSend } from "@/lib/client";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, Chip } from "../bits";
import * as Icons from "lucide-react";

interface AssignmentSummary {
  id: string;
  roleKey: string;
  roleName: string;
  scopeKey: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  roleAssignments: AssignmentSummary[];
}

interface RolesDict {
  invitable: string[];
  assignable: { key: string; name: string; description: string | null; isSystem: boolean }[];
}

interface InviteResult {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  token: string;
  tokenNote: string;
}

export function UserAdminCard() {
  const { t } = useLang();
  const { toast } = useToast();
  const { editions } = useApp();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignUser, setAssignUser] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const usersApi = useApi<{ items: UserRow[]; total: number }>(
    () => apiGet("/api/users?limit=200"),
    [],
  );
  const rolesApi = useApi<RolesDict>(() => apiGet("/api/users/roles"), []);

  const editionName = (id: string) => editions.find((e) => e.id === id)?.name ?? id;

  const reloadAll = () => {
    usersApi.reload();
  };

  const setStatus = async (user: UserRow, status: "ACTIVE" | "DISABLED") => {
    const key = `${user.id}:${status}`;
    setBusy(key);
    try {
      await apiSend(`/api/users/${user.id}/status`, "PATCH", { status });
      toast({ title: t("userAdmin.statusDone") });
      reloadAll();
    } catch (e) {
      toast({ title: t("userAdmin.statusFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (user: UserRow, assignment: AssignmentSummary) => {
    const key = `revoke:${assignment.id}`;
    setBusy(key);
    try {
      await apiSend(`/api/users/${user.id}/roles?assignmentId=${assignment.id}`, "DELETE");
      toast({ title: t("userAdmin.revokeDone") });
      reloadAll();
    } catch (e) {
      toast({ title: t("userAdmin.revokeFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title={t("userAdmin.title")}
      desc={t("userAdmin.desc")}
      action={
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Icons.UserPlus className="size-3.5" /> {t("userAdmin.invite")}
        </Button>
      }
    >
      {usersApi.loading && <Loading rows={3} />}
      {usersApi.error && <ErrorState message={usersApi.error} onRetry={usersApi.reload} />}
      {usersApi.data && usersApi.data.items.length === 0 && (
        <EmptyState title={t("userAdmin.empty")} />
      )}
      {usersApi.data && usersApi.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/60 text-muted-foreground">
                <th className="p-2.5 font-medium">{t("userAdmin.colUser")}</th>
                <th className="p-2.5 font-medium">{t("userAdmin.colLegacyRole")}</th>
                <th className="p-2.5 font-medium">{t("userAdmin.colStatus")}</th>
                <th className="p-2.5 font-medium">{t("userAdmin.colAssignments")}</th>
                <th className="p-2.5 font-medium text-right">{t("userAdmin.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usersApi.data.items.map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="p-2.5">
                    <p className="font-medium text-foreground">{u.name}</p>
                    <p className="text-muted-foreground">{u.email}</p>
                    {u.mfaEnabled && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-600">
                        <Icons.ShieldCheck className="size-3" /> MFA
                      </span>
                    )}
                  </td>
                  <td className="p-2.5">
                    <span className="font-mono">{u.role}</span>
                  </td>
                  <td className="p-2.5">
                    <Chip tone={u.status === "ACTIVE" ? "emerald" : "rose"}>{u.status}</Chip>
                  </td>
                  <td className="p-2.5">
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {u.roleAssignments.length === 0 && (
                        <span className="text-[11px] italic text-muted-foreground">{t("userAdmin.noAssignments")}</span>
                      )}
                      {u.roleAssignments.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 font-mono text-[10px]">
                          {a.roleKey}@{a.scopeKey === "TENANT" ? t("userAdmin.tenantScope") : editionName(a.scopeKey)}
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={busy === `revoke:${a.id}`}
                            onClick={() => revoke(u, a)}
                            title={t("userAdmin.revoke")}
                            aria-label={`${t("userAdmin.revoke")}: ${a.roleKey}`}
                          >
                            <Icons.X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setAssignUser(u)}>
                        {t("userAdmin.assign")}
                      </Button>
                      {u.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-destructive"
                          disabled={busy === `${u.id}:DISABLED`}
                          onClick={() => setStatus(u, "DISABLED")}
                        >
                          {t("userAdmin.disable")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px]"
                          disabled={busy === `${u.id}:ACTIVE`}
                          onClick={() => setStatus(u, "ACTIVE")}
                        >
                          {t("userAdmin.enable")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        invitable={rolesApi.data?.invitable ?? []}
        onDone={reloadAll}
      />
      <AssignDialog
        user={assignUser}
        onOpenChange={(open) => {
          if (!open) setAssignUser(null);
        }}
        assignable={rolesApi.data?.assignable ?? []}
        onDone={reloadAll}
      />
    </SectionCard>
  );
}

function InviteDialog({ open, onOpenChange, invitable, onDone }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitable: string[];
  onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  const close = () => {
    setEmail("");
    setRole("");
    setResult(null);
    onOpenChange(false);
  };

  const submit = async () => {
    if (!email.trim() || !role) return;
    setSaving(true);
    try {
      const res = await apiSend<InviteResult>("/api/users/invites", "POST", { email: email.trim(), role });
      setResult(res);
      onDone();
    } catch (e) {
      toast({ title: t("userAdmin.inviteFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-md text-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{t("userAdmin.inviteTitle")}</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 py-2">
            <p className="text-muted-foreground">{t("userAdmin.inviteOnce", { email: result.email })}</p>
            <div className="rounded-lg border bg-muted/40 p-3">
              <Label>{t("userAdmin.inviteToken")}</Label>
              <p className="mt-1 break-all font-mono text-[11px]">{result.token}</p>
            </div>
            <p className="text-[11px] text-amber-700">{result.tokenNote}</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{t("userAdmin.email")}</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@sirket.com" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("userAdmin.role")}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue placeholder={t("userAdmin.rolePh")} /></SelectTrigger>
                <SelectContent>
                  {invitable.map((r) => (
                    <SelectItem key={r} value={r} className="font-mono">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={close}>{t("common.close")}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>{t("common.cancel")}</Button>
              <Button onClick={submit} disabled={saving || !email.trim() || !role}>
                {saving ? t("common.saving") : t("userAdmin.sendInvite")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ user, onOpenChange, assignable, onDone }: {
  user: UserRow | null;
  onOpenChange: (open: boolean) => void;
  assignable: { key: string; name: string; description: string | null; isSystem: boolean }[];
  onDone: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const { editions } = useApp();
  const [roleKey, setRoleKey] = useState("");
  const [scopeKey, setScopeKey] = useState("TENANT");
  const [saving, setSaving] = useState(false);

  const close = () => {
    setRoleKey("");
    setScopeKey("TENANT");
    onOpenChange(false);
  };

  const submit = async () => {
    if (!user || !roleKey || !scopeKey) return;
    setSaving(true);
    try {
      await apiSend(`/api/users/${user.id}/roles`, "POST", { roleKey, scopeKey });
      toast({ title: t("userAdmin.assignDone") });
      onDone();
      close();
    } catch (e) {
      toast({ title: t("userAdmin.assignFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={(v) => (v ? undefined : close())}>
      <DialogContent className="sm:max-w-md text-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {t("userAdmin.assignTitle", { name: user?.name ?? "" })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{t("userAdmin.role")}</Label>
            <Select value={roleKey} onValueChange={setRoleKey}>
              <SelectTrigger><SelectValue placeholder={t("userAdmin.rolePh")} /></SelectTrigger>
              <SelectContent>
                {assignable.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    <span className="font-mono">{r.key}</span>
                    <span className="ml-2 text-muted-foreground">{r.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("userAdmin.scope")}</Label>
            <Select value={scopeKey} onValueChange={setScopeKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TENANT">{t("userAdmin.tenantScope")}</SelectItem>
                {editions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={saving || !roleKey || !scopeKey}>
            {saving ? t("common.saving") : t("userAdmin.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
