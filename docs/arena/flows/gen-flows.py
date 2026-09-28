#!/usr/bin/env python3
"""Maven tarama-2: görsel mantık akış diyagramları üreteci (SVG → sharp ile PNG)."""
import os, subprocess, json, textwrap

OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)

# renk paleti
C = {
    "bg": "#f8fafc", "panel": "#ffffff", "border": "#cbd5e1",
    "title": "#0f172a", "sub": "#475569",
    "ok": "#0f766e", "okbg": "#ccfbf1",
    "warn": "#b45309", "warnbg": "#fef3c7",
    "bad": "#b91c1c", "badbg": "#fee2e2",
    "info": "#1d4ed8", "infobg": "#dbeafe",
    "gray": "#64748b", "graybg": "#f1f5f9",
    "pro": "#7c3aed", "probg": "#ede9fe",
    "line": "#334155",
}

def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def wrap(s, n):
    return textwrap.wrap(s, n) or [""]

def box(x, y, w, h, title, lines=None, tone="gray", dashed=False, badge=None, tsize=14):
    tcol = {"ok": C["ok"], "warn": C["warn"], "bad": C["bad"], "info": C["info"], "gray": C["gray"], "pro": C["pro"]}[tone]
    # başlık: rozet dahil taşmayacak şekilde otomatik küçült
    bw_est = (max(64, 12 + 7.2 * len(badge)) + 12) if badge else 0
    avail = w - 16 - bw_est
    while tsize > 10 and len(title) * 0.62 * tsize > avail:
        tsize -= 1
    # satırlar: kutu genişliğine göre otomatik kırp/sar
    _maxc = max(18, int((w - 24) / 6.1))
    _wrapped = []
    for _ln in (lines or []):
        _wrapped.extend(textwrap.wrap(_ln, _maxc, break_long_words=False, break_on_hyphens=False) or [""])
    lines = _wrapped
    tbg = {"ok": C["okbg"], "warn": C["warnbg"], "bad": C["badbg"], "info": C["infobbg" if False else "infobg"], "gray": C["graybg"], "pro": C["probg"]}[tone]
    d = f' stroke-dasharray="6,4"' if dashed else ""
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{C["panel"]}" stroke="{tcol}" stroke-width="2"{d}/>'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="26" rx="10" fill="{tbg}"/>'
    s += f'<rect x="{x}" y="{y+14}" width="{w}" height="12" fill="{tbg}"/>'
    s += f'<text x="{x+w/2}" y="{y+18}" font-family="Arial, Helvetica, sans-serif" font-size="{tsize}" font-weight="bold" fill="{tcol}" text-anchor="middle">{esc(title)}</text>'
    ty = y + 44
    for ln in (lines or []):
        s += f'<text x="{x+10}" y="{ty}" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="{C["sub"]}">{esc(ln)}</text>'
        ty += 16
    if badge:
        bw = max(64, 12 + 7.2 * len(badge))
        bx = x + w - bw - 6
        s += f'<rect x="{bx}" y="{y-12}" width="{bw}" height="22" rx="11" fill="{tcol}"/>'
        s += f'<text x="{bx+bw/2}" y="{y+3}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">{esc(badge)}</text>'
    return s

def arrow(x1, y1, x2, y2, label=None, tone="line", dashed=False, side="top"):
    col = C.get(tone, C["line"]) if tone in C else C["line"]
    if tone == "bad": col = C["bad"]
    if tone == "ok": col = C["ok"]
    if tone == "warn": col = C["warn"]
    if tone == "info": col = C["info"]
    d = ' stroke-dasharray="6,4"' if dashed else ""
    s = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="2.2"{d}/>'
    # ok ucu
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    L, W = 9, 5
    px, py = x2 - L * math.cos(ang), y2 - L * math.sin(ang)
    nx, ny = -math.sin(ang), math.cos(ang)
    p1 = (x2, y2)
    p2 = (px + W * nx, py + W * ny)
    p3 = (px - W * nx, py - W * ny)
    pts = f"{p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} {p3[0]:.1f},{p3[1]:.1f}"
    s += f'<polygon points="{pts}" fill="{col}"/>'
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        tw = 7.0 * len(label) + 8
        oy = -8 if side == "top" else 16
        s += f'<rect x="{mx-tw/2}" y="{my+oy-11}" width="{tw}" height="15" rx="4" fill="#ffffffdd"/>'
        s += f'<text x="{mx}" y="{my+oy}" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="{col}" text-anchor="middle" font-weight="bold">{esc(label)}</text>'
    return s

def note(x, y, w, text, tone="bad"):
    tcol = C[tone]; tbg = C[tone + "bg"]
    lines = textwrap.wrap(text, max(18, int((w - 22) / 7.0)), break_long_words=False, break_on_hyphens=False)
    h = 14 + 15 * len(lines)
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{tbg}" stroke="{tcol}" stroke-width="1.6"/>'
    ty = y + 19
    for ln in lines:
        s += f'<text x="{x+10}" y="{ty}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="{tcol}">{esc(ln)}</text>'
        ty += 15
    return s, h

def header(w, title, sub):
    s = f'<rect x="0" y="0" width="{w}" height="70" fill="{C["title"]}"/>'
    s += f'<text x="24" y="32" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="bold" fill="#ffffff">{esc(title)}</text>'
    s += f'<text x="24" y="55" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#cbd5e1">{esc(sub)}</text>'
    return s

def legend(x, y):
    items = [("✓ Sağlam", "ok"), ("⚠ Risk/Uyarı", "warn"), ("✗ Kırık nokta", "bad"), ("→ Öneri (dashed)", "pro")]
    s = ""
    cx = x
    for label, tone in items:
        tcol = C[tone]
        s += f'<rect x="{cx}" y="{y}" width="14" height="14" rx="3" fill="{tcol}"/>'
        s += f'<text x="{cx+20}" y="{y+12}" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="{C["sub"]}">{esc(label)}</text>'
        cx += 24 + 7.0 * len(label)
    return s

def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="{C["bg"]}"/>{body}</svg>'

def render(name, w, h, body):
    path_svg = os.path.join(OUT, name + ".svg")
    path_png = os.path.join(OUT, name + ".png")
    with open(path_svg, "w") as f:
        f.write(svg(w, h, body))
    js = f'''
const sharp = require("sharp");
sharp("{path_svg}", {{ density: 144 }}).png().toFile("{path_png}")
  .then(i => console.log("OK {name}", i.width, i.height))
  .catch(e => {{ console.error("ERR {name}", e.message); process.exit(1); }});
'''
    r = subprocess.run(["node", "-e", js], cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))), capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())

# ══════════════════ 1) YETKİ / OTURUM AKIŞI ══════════════════
def flow1():
    W, H = 1400, 900
    b = header(W, "1 · YETKİ & OTURUM AKIŞI — UI filtresi vs Sunucu denetimi", "Tarama-2 · Maven Event Management v2 · kod referanslı görsel denetim")
    b += legend(24, 84)
    # Tarayıcı
    b += box(40, 130, 300, 96, "Tarayıcı / Shell", [
        "shell.tsx:53 → roleCanSee(constants.ts:500)",
        "menusüz rol: role=null → TÜMÜ görünür",
        "capability: visibleFor(shell.tsx:103)"], "info", badge="UI")
    # auth me
    b += box(40, 280, 300, 86, "/api/auth/me", [
        "requestActor() → staff rolü (me yok → null)",
        "auth-off: authenticated:false"], "ok", badge="✓")
    # middleware
    b += box(430, 130, 320, 96, "middleware.ts (matcher /api/*)", [
        "HMAC oturum doğrula → x-maven-session-*",
        "istemci başlıkları silinir (sahtecilik kapalı)",
        "auth-off: bayt-özdeş geçiş"], "ok", badge="✓")
    # route
    b += box(430, 300, 320, 130, "Route handler (entity + flows)", [
        "resolveContext() → YALNIZ kiracı (tenant-guard.ts)",
        "requireStaff/requireAdmin: 27 dosyada;",
        "generic CRUD + flows + mail + upload'ta YOK",
        "→ rol / modül denetimi YOK (H-04, N-01)"], "bad", badge="✗ ROL KİLİDİ YOK")
    # db
    b += box(430, 500, 320, 86, "Prisma / SQLite", [
        "ensureInScope → kiracı izolasyonu ✓ (IDOR kapalı)",
        "yazım applyWriteGuard → tenantId sunucudan"], "ok", badge="✓")
    # öneri
    b += box(900, 300, 420, 130, "ÖNERİ: requireModule(moduleId, access)", [
        "registry.ts → her varlığa module alanı",
        "ModulePermission (tenant/edition × rol × eylem)",
        "GET→VIEW · POST→USE · PUT→EDIT · export→EXPORT",
        "403 döner; UI ile AYNI matris (tek doğruluk)"], "pro", dashed=True, badge="§3.2")
    b += box(900, 500, 420, 96, "Tehlikeli uçlar (rol kapısı yok)", [
        "flows: finance.refund, registration.decide, person.merge,",
        "edition.publish · mail/send · waitlist · custom-fields/batch",
        "media/upload-linked · generic [entity] GET/PUT/DELETE"], "bad")
    # oklar
    b += arrow(340, 178, 430, 178, "istek", "info")
    b += arrow(590, 226, 590, 300, "oturum başlıkları", "ok")
    b += arrow(590, 430, 590, 500, "kiracı doğrulama ✓", "ok")
    b += arrow(750, 365, 900, 365, "EKLENECEK KAPI", "info", dashed=True)
    b += arrow(750, 545, 966, 560, "bugün: denetim yok", "bad", side="bottom")
    b += arrow(340, 323, 430, 340, "rol", "info")
    b += arrow(190, 226, 190, 280, "role", "info")
    n, nh = note(40, 400, 350, "Kopukluk: menuye girmek ≠ API'de yapabilmek — UI maskesi guvenlik degildir (H-04)", "bad")
    b += n
    n2, _ = note(40, 400 + nh + 10, 350, "next.config.ts:7 ignoreBuildErrors:true + CI yok + typecheck script yok → tip kapıları da kapalı (N-01)", "warn")
    b += n2
    n3, _ = note(900, 640, 420, "Öncelik: requireModule → flows/mail/upload uçlarına ilk uygulanacak yüzey (en yüksek risk)", "warn")
    b += n3
    render("01-yetki-oturum-akisi", W, H, b)

# ══════════════════ 2) SPONSORLUK AKIŞI ══════════════════
def flow2():
    W, H = 1500, 1000
    b = header(W, "2 · SPONSORLUK AKIŞI — Ekle / Ata / Kanban uçtan uca tarama", "H-01 kırık kayıt · H-02 durum sözlüğü çelişkisi · H-03 tier ölü + kapasite denetimsiz")
    b += legend(24, 84)
    # Sponsorluk Ekle (yok)
    b += box(40, 130, 340, 150, "SPONSORLUK EKLE (tier/paket)", [
        "UI: YOK — sponsor-tiers view'da 0 kullanım",
        "Veri: SponsorTierDefinition(schema:873) + seed:314",
        "Kapasite alanı schema:878 — denetim YOK",
        "Kanban tier seçici: hard-code PLATINUM/GOLD… (kanban:299)"], "bad", badge="✗ H-03")
    # Sponsor Ata
    b += box(40, 330, 340, 130, "SPONSOR ATA (kurum→tier)", [
        "UI: YOK (ata diyalogu yok)",
        "Kapasite 'Bronz/3' kontrolü yok → aşım sessiz",
        "Kişi sponsoru: personId alanı yok (organizationId zorunlu)"], "bad", badge="✗ H-03")
    # Kanban yeni anlaşma
    b += box(440, 130, 360, 150, "Kanban · Yeni Sponsor Anlaşması", [
        "sponsorship-kanban.tsx:84 diyalog → orgName serbest metin",
        "handleNewDeal (sponsorship.tsx:178) POST:",
        "{editionId, amount, currency, status}",
        "organizationId YOK, tierId YOK, orgName→Organization YOK"], "bad", badge="✗ H-01")
    # API
    b += box(440, 340, 360, 110, "POST /sponsor-agreements", [
        "registry:286 validate YOK → Prisma",
        "schema:906 organizationId zorunlu → P2001→400",
        "route.ts:171 catch → 'Kayıt oluşturulamadı'"], "bad", badge="✗ HER ZAMAN 400")
    # DB
    b += box(440, 520, 360, 96, "SponsorAgreement (DB)", [
        "status enum: PROSPECT|NEGOTIATION|CONTRACTED|",
        "ACTIVE|COMPLETED|CANCELLED (schema:911)"], "gray")
    # kanban aşamaları
    b += box(870, 130, 330, 120, "Kanban STAGES (kanban:40)", [
        "LEAD → PROPOSAL → CONTRACT → PAID",
        "PUT status: geçersiz değerler DB'ye yazılıyor",
        "validate enum kapısı yok (H-02)"], "bad", badge="✗ H-02")
    # sözleşme kartı
    b += box(870, 320, 330, 106, "Sözleşme kartı rozeti", [
        "StatusBadge beklenen: PROSPECT/NEGOTIATION/…",
        "yazılan: PROPOSAL/CONTRACT/PAID → '—' / ham değer"], "warn", badge="⚠")
    # portal
    b += box(870, 500, 330, 106, "Dış Portal + test 06", [
        "sponsor listesi status in ACTIVE|CONTRACTED",
        "PAID'a taşınan kart portalde/filtrede kaybolur"], "warn", badge="⚠")
    # tier→seed bağlantısı
    b += box(40, 520, 340, 96, "Seed 4 tier (seed:314-317)", [
        "Gold 5 · Silver 10 · Bronz 15 · Medya 2 (kapasiteli)",
        "registry sponsor-tiers hazır → UI'ya bağlanmamış"], "warn", badge="⚠")
    # entitle
    b += box(40, 660, 340, 110, "Hak havuzları (mevcut)", [
        "Entitlement 20/14/2/4 akışı ✓ · komite onayı ✓",
        "tier.rights JSON → havuza aktarım BAĞLANTISI YOK",
        "orgOptions (sponsorship:166) SADECE anlaşmalı kurumlar"], "warn", badge="⚠")
    # önerilen akış
    b += box(870, 660, 580, 150, "ÖNERİLEN AKIŞ (§3.7)", [
        "Sponsorluk Ekle: tier CRUD (category/rank/rights/capacity) + ön yükleme",
        "Sponsor Ata: tier seç → kapasite rozeti (2/3) → kurum KİŞİ autocomplete",
        "→ POST {organizationId, tierId, packageId?, amount, status:PROSPECT}",
        "beforeWrite: capacity aşımı → 409 · kanban STAGES şemaya hizalı",
        "ekranlar: Genel Bakış | Sponsorluk Ekle | Sponsor Ata | Sözleşmeler | Havuzlar"], "pro", dashed=True, badge="§3.7")
    # oklar
    b += arrow(380, 205, 440, 205, "", "bad")
    b += arrow(620, 280, 620, 340, "POST", "bad")
    b += arrow(620, 450, 620, 520, "", "line")
    b += arrow(800, 190, 870, 190, "status", "bad")
    b += arrow(1035, 250, 1035, 320, "", "bad")
    b += arrow(1035, 426, 1035, 500, "filtre", "warn")
    b += arrow(380, 566, 440, 566, "kullanılmıyor", "bad", dashed=True, side="bottom")
    b += arrow(620, 616, 620, 700, "hak aktarımı yok", "warn", dashed=True, side="bottom")
    b += arrow(1035, 606, 1035, 660, "", "info")
    b += arrow(380, 700, 866, 715, "tier/hak beslemeli", "info", dashed=True, side="bottom")
    n, nh = note(40, 800, 400, "Kritik: 'Yeni Anlaşma' butonu hicbir kosulda kayit uretmiyor — uctan uca kirik (H-01)", "bad")
    b += n
    n2, _ = note(460, 800, 400, "Sözlük birleşmesi: LEAD→PROSPECT · PROPOSAL→NEGOTIATION · CONTRACT→CONTRACTED · PAID→ACTIVE (H-02)", "warn")
    b += n2
    render("02-sponsorluk-akisi", W, H, b)

# ══════════════════ 3) KİŞİ / VERİ AKIŞI ══════════════════
def flow3():
    W, H = 1500, 980
    b = header(W, "3 · KİŞİ & VERİ AKIŞI — Form → Zincir → Etkinlik → Şirket CRM → Gönderim", "H-07 event kapsamı ters · H-08 şirket CRM etkinlik yeteneğine mahkûm · N-04 e-posta çakışması")
    b += legend(24, 84)
    # public form
    b += box(40, 130, 300, 130, "Herkese Açık Form", [
        "public-form.tsx → POST /api/public-register",
        "rate: 10/dk IP + 6/dk e-posta ✓",
        "spam-guard + honeypot + HMAC challenge ✓"], "ok", badge="✓")
    # manual
    b += box(40, 310, 300, 120, "Manuel Giriş", [
        "QuickAddRow / BulkPaste / InlineEdit ✓",
        "manual-registration.ts:80 createManual ✓",
        "registrations/import (xlsx) ✓ — ama xlsx CVE (N-06)"], "warn", badge="⚠")
    # chain
    b += box(40, 490, 300, 130, "registration-chain.ts", [
        "FormSubmission→Person→Participation→Registration",
        "TEK transaction · idempotent (registrationId @unique)",
        "source: PUBLIC_FORM (chain:98) ✓ izlenebilir"], "ok", badge="✓")
    # event people
    b += box(430, 130, 340, 150, "ETKİNLİK KİŞİ/KURULUŞ", [
        "EventParticipation (kişi×etkinlik) + Person360 ✓",
        "AMA people.tsx:900 → tenant-genel liste;",
        "seçili edisyon filtresi YOK (H-07)",
        "organizations da tenant-genel (people:2034)"], "bad", badge="✗ H-07")
    # company archive
    b += box(430, 340, 340, 130, "ŞİRKET ARŞİVİ (tenant)", [
        "Person/Organization/CustomerContact ✓",
        "import-participants: katılımcı→müşteri havuzu ✓",
        "commsOptIn:true filtresi (broadcast:108) ✓"], "ok", badge="✓")
    # comms module gate
    b += box(430, 540, 340, 130, "İLETİŞİM MODÜLÜ", [
        "MODULES: capability=COMMUNICATIONS (constants:474)",
        "etkinlik yeteneği kapalı → şirket CRM MENÜDE YOK",
        "havuz tenant-scoped olduğu için katman yanlış (H-08)"], "bad", badge="✗ H-08")
    # channels
    b += box(430, 740, 340, 120, "KANALLAR", [
        "EMAIL: smtp+MailSuppression+kota ✓ (mail-dispatch:73)",
        "SMS: Netgsm/Twilio ✓ · WhatsApp: Twilio (notify:87)",
        "Meta Cloud API template akışı YOK (S-07)"], "warn", badge="⚠")
    # registration detail
    b += box(860, 130, 300, 130, "Kayıt/Ödeme", [
        "Order/Payment (iyzico imza HMAC ✓)",
        "registration.decide / refund:",
        "flows'ta rol kapısı YOK (N-01)"], "warn", badge="⚠")
    # e-posta çakışması
    b += box(860, 330, 300, 130, "User.email (kişisel hesap)", [
        "schema: global @unique DEĞİL",
        "register:28 global findFirst → aynı e-posta",
        "2. şirkette REDDİLİR · login:31 ilk kiracıya düşer"], "bad", badge="✗ N-04")
    # multi tenant slug
    b += box(860, 530, 300, 130, "Slug'lar global unique", [
        "Tenant/EventSeries/EventEdition/FormDefinition",
        "slug @unique → kiracılar arası çakışma +",
        "409/varlık ifşası (N-05)"], "bad", badge="✗ N-05")
    # öneri
    b += box(860, 740, 590, 120, "ÖNERİ", [
        "People 2 sekme: [Bu Etkinlik|Şirket Arşivi] + ?editionId= API (§3.6)",
        "company-communications modülü capability'siz (§3.5) · User.email @@unique([tenantId,email])",
        "slug @@unique([tenantId,slug]) · import uçlarına xlsx yerine güvenli parser"], "pro", dashed=True, badge="§3.5-3.6")
    # oklar
    b += arrow(340, 195, 430, 195, "kayıt", "ok")
    b += arrow(190, 430, 190, 490, "zincir", "ok")
    b += arrow(340, 545, 500, 472, "zincir→havuz", "ok")
    b += arrow(600, 280, 600, 340, "event↔tenant", "warn")
    b += arrow(600, 470, 600, 540, "", "bad")
    b += arrow(600, 670, 600, 740, "gönderim", "line")
    b += arrow(340, 370, 430, 400, "", "line")
    n, nh = note(40, 660, 350, "Veri yolları sağlam (form+manuel+import); kopukluk KATMAN görünürlüğünde: event listesi ↔ şirket arşivi ayrımı yok (H-07)", "warn")
    b += n
    render("03-kisi-veri-akisi", W, H, b)

# ══════════════════ 4) KAPSAM KARAR AĞACI ══════════════════
def flow4():
    W, H = 1450, 940
    b = header(W, "4 · KAPSAM & KARAR AĞACI — Yetki + Katman (şirket ↔ etkinlik) taraması", "Nerede hangi kapı var, nerede önerili yeni kapı — karar ağacı görünümü")
    b += legend(24, 84)
    b += box(520, 110, 400, 74, "İstek / Görünüm Kararı", [
        "herhangi bir modül açılışı veya API çağrısı"], "info")
    # sol: UI
    b += box(120, 240, 420, 160, "UI KARARI (tarayıcı)", [
        "1) yetenek var mı? visibleFor(shell:103)",
        "2) rol görür mü? roleCanSee(constants:500)",
        "   role=null (auth-off) → TÜMÜ (bilinçli demo)",
        "   ORG_* → her şey · değilse MODULES.roles statik",
        "3) seçim → MODULE_COMPONENTS(module-components.tsx)"], "warn", badge="⚠ UI-ÖZEL")
    # sağ: API
    b += box(880, 240, 440, 160, "API KARARI (sunucu)", [
        "1) middleware: oturum var mı? (auth-on) ✓",
        "2) resolveContext: KİRACI ✓ (tenant-guard)",
        "3) ensureInScope: kayıt kiracıda mı ✓ (IDOR)",
        "4) rol/modül izni: — YOK — (H-04/N-02)",
        "5) validate/beforeWrite: yalnız bazı varlıklarda"], "bad", badge="✗ KAPI EKSİK")
    # katman kutuları
    b += box(120, 470, 420, 150, "ŞİRKET KATMANI (Tenant)", [
        "ayarlar/dil ✓ · tema ✗(H-09) · kullanıcı yönetimi ✗(H-05)",
        "arşiv+depo+import/export merkezi ✗(H-10)",
        "kişi arşivi ✓ · CRM gönderim: capability'ye bağlı ✗(H-08)",
        "tanıtım ✗(H-11) · CustomRole.permissions: yazılır okunmaz (H-06)"], "warn", badge="KISMİ")
    b += box(880, 470, 440, 150, "ETKİNLİK KATMANI (Edition)", [
        "capability ✓ · 26 modül ✓ · seed tier verisi ✓ ama UI yok",
        "kişi listesi etkinlik Bağlı DEĞİL (H-07)",
        "personel↔etkinlik ataması: model YOK (H-06)",
        "sponsorluk akışı kırık (H-01/02/03)"], "warn", badge="KISMİ")
    # öneri katman
    b += box(360, 690, 720, 130, "ÖNERİLEN KARAR KATMANI (tek doğruluk kaynağı)", [
        "resolveAccess(user, moduleId, editionId, action):",
        "  1) ORG_OWNER/ORG_ADMIN → FULL  ·  2) UserEventAssignment (etkinlik override)",
        "  3) StaffRole/rol ModulePermission (şirket)  ·  4) fallback MODULES.roles (geriye-uyum)",
        "UI: effectiveAccess() = API: requireModule() → aynı tablo ModulePermission"], "pro", dashed=True, badge="§3.2")
    # oklar
    b += arrow(640, 184, 330, 240, "", "info")
    b += arrow(740, 184, 1000, 240, "", "info")
    b += arrow(330, 400, 330, 470, "görünürlük", "warn")
    b += arrow(1100, 400, 1100, 470, "veri", "bad")
    b += arrow(330, 620, 520, 690, "", "line")
    b += arrow(1100, 620, 920, 690, "", "line")
    b += arrow(540, 320, 880, 320, "AYNI matris değil", "bad", dashed=True, side="bottom")
    n, nh = note(120, 850, 700, "Tespit: iki karar merkezi birbirinden bağımsız — UI maskesi ile API arasında tutarlılık ZORUNLU (matris tek tabloda)", "bad")
    b += n
    n2, _ = note(850, 850, 470, "Öncelik sırası: flows → generic CRUD → mail/upload → export", "warn")
    b += n2
    render("04-kapsam-karar-agaci", W, H, b)

flow1(); flow2(); flow3(); flow4()
print("Bitti:", os.listdir(OUT))
