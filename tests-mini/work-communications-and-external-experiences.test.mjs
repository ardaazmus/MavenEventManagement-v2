import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("Faz 10: Dual Sidebar iletisim ve deneyim rotalarını haritalar", () => {
  const taxFile = path.join(rootDir, "src/lib/product-taxonomy.ts");
  const taxContent = fs.readFileSync(taxFile, "utf8");

  // communication_experience grubu ve ogeleri
  assert.match(taxContent, /id: "communication_experience"/, "communication_experience grubu bulunmali");
  assert.match(taxContent, /id: "work-comms"/, "work-comms alt ogesi bulunmali");
  assert.match(taxContent, /id: "external-experiences"/, "external-experiences alt ogesi bulunmali");
  assert.match(taxContent, /id: "media"/, "media alt ogesi bulunmali");

  const sideFile = path.join(rootDir, "src/components/maven/navigation/dual-sidebar.tsx");
  const sideContent = fs.readFileSync(sideFile, "utf8");

  // setModule yonlendirmeleri
  assert.match(sideContent, /setModule\("communications",\s*null\)/, "work-comms communications modulune yonlendirmeli");
  assert.match(sideContent, /setModule\("portals",\s*"pwa"\)/, "external-experiences portals modulune pwa subview ile yonlendirmeli");
  assert.match(sideContent, /setModule\("media",\s*null\)/, "media media modulune yonlendirmeli");

  // isItemActive kontrolleri
  assert.match(sideContent, /item\.primaryModuleId === "communications"/, "communications aktiflik kontrolu bulunmali");
  assert.match(sideContent, /item\.primaryModuleId === "portals"/, "portals aktiflik kontrolu bulunmali");
  assert.match(sideContent, /item\.primaryModuleId === "media"/, "media aktiflik kontrolu bulunmali");
});

test("Faz 10: Is Iletisimi (CommunicationsView) kapsam bildirim seridi ve Firma Genel Iletisimine gecis butonunu icerir", () => {
  const file = path.join(rootDir, "src/components/maven/views/onsite.tsx");
  const content = fs.readFileSync(file, "utf8");

  // Kapsam bildirim seridi ve buton
  assert.match(content, /workScopeNotice/, "workScopeNotice bildirim metni anahtari bulunmali");
  assert.match(content, /workScopeTitle/, "workScopeTitle baslik anahtari bulunmali");
  assert.match(content, /btnOpenCompanyComms/, "btnOpenCompanyComms buton anahtari bulunmali");
  assert.match(content, /setModule\("company-communications"\)/, "Firma genel iletisimine gecis yapmali");
});

test("Faz 10: PortalsView 5 dis deneyim alanini, vitrin izolasyonunu ve dis yayin akisini sunar", () => {
  const file = path.join(rootDir, "src/components/maven/views/portals.tsx");
  const content = fs.readFileSync(file, "utf8");

  // 5 sekmeden olusan dis deneyim mimarisi
  assert.match(content, /value="pwa"/, "pwa Mobil Deneyim sekmesi bulunmali");
  assert.match(content, /value="attendee"/, "attendee Katilimci Portali sekmesi bulunmali");
  assert.match(content, /value="b2b"/, "b2b B2B Portali sekmesi bulunmali");
  assert.match(content, /value="sponsor"/, "sponsor Sponsor Portali sekmesi bulunmali");
  assert.match(content, /value="client"/, "client Musteri Portali sekmesi bulunmali");

  // moduleSubView senkronizasyonu
  assert.match(content, /moduleSubView/, "moduleSubView destructuring yapilmali");
  assert.match(content, /setTimeout\(/, "React 19 uyumlu setTimeout ile subview sync yapilmali");

  // Firma vitrini izolasyon bildirimi
  assert.match(content, /portalsView\.isolation\.title/, "showcase isolation basligi bulunmali");
  assert.match(content, /portalsView\.isolation\.desc/, "showcase isolation aciklamasi bulunmali");
  assert.match(content, /portalsView\.isolation\.btnVitrin/, "vitrin gecis butonu bulunmali");

  // Is iceriginden dis yayin akisi
  assert.match(content, /PublishStatusCard/, "PublishStatusCard bileseni bulunmali");
  assert.match(content, /portalsView\.publish\.title/, "Dıs yayin basligi bulunmali");
  assert.match(content, /portalsView\.publish\.liveSync/, "Canli senkron rozeti bulunmali");
  assert.match(content, /portalsView\.publish\.items\.program/, "Program yayin ogesi bulunmali");
  assert.match(content, /portalsView\.publish\.items\.speakers/, "Konusmacilar yayin ogesi bulunmali");
  assert.match(content, /portalsView\.publish\.items\.sponsors/, "Sponsorlar yayin ogesi bulunmali");
  assert.match(content, /portalsView\.publish\.items\.forms/, "Formlar yayin ogesi bulunmali");
});

test("Faz 10: i18n Sozluklerinde portalsView ve communications anahtarlarinin TR/EN paritesi dogrulanir", () => {
  const trFile = path.join(rootDir, "src/i18n/tr.json");
  const enFile = path.join(rootDir, "src/i18n/en.json");
  const tr = JSON.parse(fs.readFileSync(trFile, "utf8"));
  const en = JSON.parse(fs.readFileSync(enFile, "utf8"));

  // communications workScope kontrolleri
  assert.ok(tr.communications?.workScopeTitle, "tr communications.workScopeTitle tanimli olmali");
  assert.ok(en.communications?.workScopeTitle, "en communications.workScopeTitle tanimli olmali");
  assert.ok(tr.communications?.workScopeNotice, "tr communications.workScopeNotice tanimli olmali");
  assert.ok(en.communications?.workScopeNotice, "en communications.workScopeNotice tanimli olmali");
  assert.ok(tr.communications?.btnOpenCompanyComms, "tr communications.btnOpenCompanyComms tanimli olmali");
  assert.ok(en.communications?.btnOpenCompanyComms, "en communications.btnOpenCompanyComms tanimli olmali");

  // portalsView 5 sekme ve kontroller
  assert.ok(tr.portalsView?.tabs?.pwa, "tr portalsView.tabs.pwa tanimli olmali");
  assert.ok(en.portalsView?.tabs?.pwa, "en portalsView.tabs.pwa tanimli olmali");
  assert.ok(tr.portalsView?.tabs?.attendee, "tr portalsView.tabs.attendee tanimli olmali");
  assert.ok(en.portalsView?.tabs?.attendee, "en portalsView.tabs.attendee tanimli olmali");
  assert.ok(tr.portalsView?.tabs?.b2b, "tr portalsView.tabs.b2b tanimli olmali");
  assert.ok(en.portalsView?.tabs?.b2b, "en portalsView.tabs.b2b tanimli olmali");
  assert.ok(tr.portalsView?.tabs?.sponsor, "tr portalsView.tabs.sponsor tanimli olmali");
  assert.ok(en.portalsView?.tabs?.sponsor, "en portalsView.tabs.sponsor tanimli olmali");
  assert.ok(tr.portalsView?.tabs?.client, "tr portalsView.tabs.client tanimli olmali");
  assert.ok(en.portalsView?.tabs?.client, "en portalsView.tabs.client tanimli olmali");

  // portalsView isolation ve publish
  assert.ok(tr.portalsView?.isolation?.title, "tr portalsView.isolation.title tanimli olmali");
  assert.ok(en.portalsView?.isolation?.title, "en portalsView.isolation.title tanimli olmali");
  assert.ok(tr.portalsView?.publish?.title, "tr portalsView.publish.title tanimli olmali");
  assert.ok(en.portalsView?.publish?.title, "en portalsView.publish.title tanimli olmali");
  assert.ok(tr.portalsView?.publish?.items?.program, "tr portalsView.publish.items.program tanimli olmali");
  assert.ok(en.portalsView?.publish?.items?.program, "en portalsView.publish.items.program tanimli olmali");
});
