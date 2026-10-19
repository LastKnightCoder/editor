import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom" },
  resolve: { dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd"] },
});
