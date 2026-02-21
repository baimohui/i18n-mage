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
      emptyOutDir: true,
      sourcemap: isDev,
      minify: isDev ? false : "esbuild",
      rollupOptions: {
        input: {
          "fix-preview": resolve(__dirname, "src/webviews/fix-preview/main.tsx"),
          "extract-setup": resolve(__dirname, "src/webviews/extract-setup/main.tsx")
        },
        output: {
          format: "es",
          entryFileNames: "[name].js"
        }
      }
    }
  };
});
