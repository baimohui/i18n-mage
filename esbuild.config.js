const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    minify: true,
    outfile: "dist/extension.js",
    platform: "node",
    target: "node18",
    external: ["vscode"],
    sourcemap: false,
    legalComments: "inline"
  })
  .catch(() => process.exit(1));
