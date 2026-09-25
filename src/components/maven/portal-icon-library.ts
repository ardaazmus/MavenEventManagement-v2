// ─── PORTAL İKON KÜTÜPHANESİ ────────────────────────────────────────────────
// Kullanıcı isteği: "Sisteme kullanışlı bir icon kütüphanesi eklensin. Tüm iconlar
// hem icon kütüphanesinden hem svg yüklenebilsin."
// • Düz lucide-react ikon adları (ImportMaps["Home"] gibi) — resolvePortalIcon
//   çalışma anında lucide-react ad alanından çözüm yapar; bilinmeyen ad → null.
// • k alanı: TR/EN arama anahtar kelimeleri (IconPicker arama kutusu).
import * as Icons from "lucide-react";

export type LibraryIcon = { n: string; k: string };

export const PORTAL_ICON_LIBRARY: LibraryIcon[] = [
  // ── Navigasyon & genel ──
  { n: "Home", k: "anasayfa ev home başlangıç" },
  { n: "CalendarDays", k: "takvim program calendar etkinlik" },
  { n: "Map", k: "harita kroki map plan" },
  { n: "MapPin", k: "konum pin yer pin location" },
  { n: "Compass", k: "pusula compass yön" },
  { n: "Navigation", k: "navigasyon yön ok" },
  { n: "ArrowRight", k: "ok sağ ileri" },
  { n: "ArrowLeft", k: "ok sol geri" },
  { n: "ArrowUpRight", k: "ok dış link aç" },
  { n: "ChevronRight", k: "chevron sağ ileri" },
  { n: "ChevronLeft", k: "chevron sol geri" },
  { n: "ChevronDown", k: "chevron aşağı açılır" },
  { n: "ExternalLink", k: "dış bağlantı web site" },
  { n: "Menu", k: "menü hamburger" },
  { n: "LayoutGrid", k: "grid ızgara modüller" },
  { n: "Grid3x3", k: "grid ızgara" },
  { n: "List", k: "liste list" },
  { n: "Search", k: "ara araştır search" },
  { n: "Eye", k: "görüntüle göz" },
  { n: "EyeOff", k: "gizle göz kapalı" },
  { n: "Filter", k: "filtre süz" },
  { n: "RotateCcw", k: "yenile geri dön" },
  { n: "Maximize2", k: "büyüt tam ekran" },
  { n: "Minimize2", k: "küçült" },

  // ── Etkinlik & zaman ──
  { n: "CalendarRange", k: "takvim aralık tarih" },
  { n: "CalendarCheck", k: "takvim onay katılım" },
  { n: "Clock", k: "saat time" },
  { n: "Timer", k: "zamlayıcı süre" },
  { n: "Hourglass", k: "kum saati" },
  { n: "Bell", k: "zil bildirim hatırlat" },
  { n: "BellRing", k: "zil çalan bildirim" },
  { n: "BellOff", k: "zil kapalı sessiz" },
  { n: "Megaphone", k: "duyuru anons duyur" },
  { n: "Ticket", k: "bilet davetiye" },
  { n: "QrCode", k: "qr kod check-in" },
  { n: "ScanLine", k: "tara okut qr" },
  { n: "Flag", k: "bayrak işaret" },
  { n: "Bookmark", k: "kaydet yer imi favori" },
  { n: "Star", k: "yıldız favori puan" },
  { n: "Sparkles", k: "parıltı özel öne çıkan" },
  { n: "Award", k: "ödül rozet madalya" },
  { n: "Trophy", k: "kupa ödül oyunlaştırma" },
  { n: "Medal", k: "madalya rozet" },
  { n: "Gift", k: "hediye ödül sponsor" },
  { n: "Zap", k: "şimşek enerji hızlı" },

  // ── İnsanlar & iletişim ──
  { n: "UserRound", k: "kullanıcı profil kişi" },
  { n: "Users", k: "kullanıcılar katılımcılar grup" },
  { n: "UserPlus", k: "kullanıcı ekle kayıt" },
  { n: "Contact", k: "rehber kişi kartı" },
  { n: "IdCard", k: "kimlik yaka kart" },
  { n: "Mic2", k: "mikrofon konuşmacı sunum" },
  { n: "Mic", k: "mikrofon ses" },
  { n: "Speech", k: "konuşma sunum oturum" },
  { n: "MessageCircle", k: "mesaj sohbet chat" },
  { n: "MessageCircleQuestion", k: "soru cevap soru-cevap" },
  { n: "MessagesSquare", k: "mesajlar sohbet" },
  { n: "Phone", k: "telefon ara" },
  { n: "Smartphone", k: "mobil telefon uygulama" },
  { n: "Mail", k: "e-posta mail" },
  { n: "Send", k: "gönder ileti" },
  { n: "AtSign", k: "e-posta mention" },
  { n: "Linkedin", k: "linkedin sosyal" },

  // ── Form & doküman ──
  { n: "ClipboardList", k: "form anket liste" },
  { n: "FileText", k: "dosya doküman form" },
  { n: "FileQuestion", k: "form soru quiz" },
  { n: "FileCheck", k: "form onay tamam" },
  { n: "PenLine", k: "yaz kalem imza" },
  { n: "ListChecks", k: "kontrol listesi görev" },
  { n: "Paperclip", k: "ek dosya ataç" },
  { n: "Download", k: "indir rapor" },
  { n: "Upload", k: "yükle" },
  { n: "FolderOpen", k: "klasör arşiv" },
  { n: "Archive", k: "arşiv sakla" },
  { n: "BookOpen", k: "kitap rehber bilimsel" },
  { n: "GraduationCap", k: "eğitim cme mezuniyet" },

  // ── İş & sponsor ──
  { n: "Handshake", k: "b2b iş birliği görüşme sponsor" },
  { n: "Building2", k: "bina kurum şirket organizasyon" },
  { n: "Briefcase", k: "iş portföy" },
  { n: "Globe", k: "web dünya site" },
  { n: "CreditCard", k: "kredi kartı ödeme" },
  { n: "Wallet", k: "cüzdan bakiye" },
  { n: "TrendingUp", k: "yükseliş istatistik" },
  { n: "BarChart3", k: "grafik rapor istatistik" },
  { n: "PieChart", k: "pasta grafik" },
  { n: "Target", k: "hedef amaç" },
  { n: "Rocket", k: "roket başlat lansman" },
  { n: "Lightbulb", k: "fikir ampul inovasyon" },
  { n: "Wrench", k: "anahtar tamir ayar" },
  { n: "Cog", k: "çark ayarlar mekanik" },
  { n: "Package", k: "paket stok" },
  { n: "Truck", k: "kamyon lojistik" },
  { n: "BedDouble", k: "otel konaklama yatak" },
  { n: "UtensilsCrossed", k: "yemek ikram restoran" },
  { n: "Bus", k: "otobüs transfer ulaşım" },
  { n: "Plane", k: "uçak transfer" },

  // ── Medya ──
  { n: "ImageIcon", k: "resim görsel foto" },
  { n: "Camera", k: "kamera fotoğraf" },
  { n: "Video", k: "video kayıt" },
  { n: "Music", k: "müzik ses" },
  { n: "Headphones", k: "kulaklık ses" },
  { n: "Play", k: "oynat video" },
  { n: "Film", k: "film video" },
  { n: "Volume2", k: "ses açık" },
  { n: "MonitorPlay", k: "yayın ekran izle" },

  // ── Durum ──
  { n: "Check", k: "onay tik tamam" },
  { n: "CheckCheck", k: "çift tik okundu" },
  { n: "CircleCheck", k: "tamamlandı onay daire" },
  { n: "X", k: "kapat iptal çarpı" },
  { n: "AlertTriangle", k: "uyarı dikkat" },
  { n: "Info", k: "bilgi bilgi not" },
  { n: "HelpCircle", k: "yardım soru" },
  { n: "ThumbsUp", k: "beğen like" },
  { n: "Heart", k: "kalp beğeni favori" },
  { n: "Shield", k: "kalkan güvenlik" },
  { n: "ShieldCheck", k: "güvenlik onaylı kvkk" },
  { n: "Lock", k: "kilit yetki" },
  { n: "Unlock", k: "kilit açık" },
  { n: "KeyRound", k: "anahtar kod giriş" },
  { n: "LogIn", k: "giriş oturum aç" },
  { n: "LogOut", k: "çıkış oturum kapat" },
  { n: "Settings", k: "ayarlar yapılandırma" },
  { n: "Loader2", k: "yükleniyor spinner bekle" },
];

// "ImageIcon" gibi alias adları lucide-react'te "Image" olarak geçer — çözüm tablosu
const ALIAS: Record<string, string> = { ImageIcon: "Image" };

export function resolvePortalIcon(name: string | null | undefined): (typeof Icons.Home) | null {
  if (!name || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name)) return null;
  const candidate = (Icons as unknown as Record<string, unknown>)[ALIAS[name] ?? name];
  if (typeof candidate === "function" || (typeof candidate === "object" && candidate !== null)) {
    return candidate as typeof Icons.Home;
  }
  return null;
}
