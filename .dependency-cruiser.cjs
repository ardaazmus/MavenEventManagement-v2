/** @type {import('dependency-cruiser').IConfiguration} */
// H-17: gerçek Maven katmanlarına göre mimari kapı.
// Yön: src/app → src/components → src/lib (tersi yasak); src test ağaçlarına giremez.
module.exports = {
  forbidden: [
    {
      name: "lib-cannot-import-app-or-components",
      comment: "Paylaşılan kütüphane katmanı route/view katmanlarına bağımlı olamaz",
      severity: "error",
      from: {
        path: "^src/lib",
        // module-components.tsx BY-DESIGN kompozisyon köküdür (modül→bileşen
        // tek kayıt noktası); katman kuralından muaftır.
        pathNot: ["^src/lib/module-components\\.tsx$"],
      },
      to: { path: "^src/(app|components)" },
    },
    {
      name: "components-cannot-import-app",
      comment: "View katmanı route handler'larına giremez (veri erişimi API istemcisiyle)",
      severity: "error",
      from: { path: "^src/components" },
      to: { path: "^src/app" },
    },
    {
      name: "src-cannot-import-tests",
      comment: "Üretim kodu test ağaçlarına bağımlı olamaz",
      severity: "error",
      from: { path: "^src" },
      to: { path: "^(tests|tests-mini)" },
    },
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
