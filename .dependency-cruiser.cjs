/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-cross-module-internal-imports",
      comment: "Modules must only import from the public index.ts of sibling modules",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/.+" },
      to: {
        path: "^src/modules/([^/]+)/.+",
        pathNot: [
          "^src/modules/$1/.+",
          "^src/modules/[^/]+/index\\.ts$"
        ]
      }
    },
    {
      name: "domain-cannot-import-infrastructure",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain" },
      to: { path: "^src/modules/[^/]+/(infrastructure|ui|actions)" }
    },
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" }
  }
};
