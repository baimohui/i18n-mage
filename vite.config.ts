import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [preact()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
        "@utils": resolve(__dirname, "src/utils")
      }
    },
    define: {
      __IS_DEV__: JSON.stringify(isDev),
      "process.env.NODE_ENV": JSON.stringify(mode)
    },
    build: {
      outDir: "dist/webviews",
      emptyOutDir: false,
      sourcemap: true,
      minify: isDev ? false : "esbuild",
      lib: {
        entry: resolve(__dirname, "src/webviews/fix-preview/main.tsx"),
        name: "FixPreview",
        formats: ["umd"],
        fileName: () => "fix-preview.js"
      },
      rollupOptions: {
        external: [],
        output: {
          inlineDynamicImports: true,
          globals: {},
          format: "umd",
          sourcemapPathTransform: () => {
            // 返回相对于 JS 文件的 sourcemap 路径
            return `fix-preview.js.map`;
          }
        }
      }
    }
  };
});
