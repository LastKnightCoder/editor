import { defineConfig, splitVendorChunkPlugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import visualizer from "rollup-plugin-visualizer";

import * as path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@quick-card": path.resolve(__dirname, "quick-card"),
        "@editor": path.resolve(__dirname, "src/components/Editor"),
      },
    },
    plugins: [
      react(),
      splitVendorChunkPlugin(),
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    clearScreen: false,
    server: {
      strictPort: true,
    },
    envPrefix: ["VITE_"],
    base: "/editor",
    build: {
      // don't minify for debug builds
      minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
      rollupOptions: {
        input: {
          profile: path.resolve(__dirname, "profile/index.html"),
        },
        output: {
          manualChunks: {
            react: ["react"],
            "react-dom": ["react-dom"],
            "react-router-dom": ["react-router-dom"],
            mermaid: ["mermaid"],
            katex: ["katex"],
            "@babel/standalone": ["@babel/standalone"],
          },
        },
      },
      target: "esnext",
    },
  };
});
