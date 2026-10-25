import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  build: { target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"] },
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd", "react-dnd-html5-backend"],
  },
});
