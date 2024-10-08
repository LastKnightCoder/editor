import { defineConfig, splitVendorChunkPlugin  } from 'vite';
import react from '@vitejs/plugin-react-swc';
import visualizer from "rollup-plugin-visualizer";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import * as path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@quick-card': path.resolve(__dirname, 'quick-card'),
      '@editor': path.resolve(__dirname, 'src/components/Editor'),
    }
  },
  plugins: [
    react(), 
    splitVendorChunkPlugin(), 
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true
    }), 
    wasm(), 
    topLevelAwait()
  ],
  clearScreen: false,
  server: {
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks: {
          'react': ['react'],
          'react-dom': ['react-dom'],
          'react-router-dom': ['react-router-dom'],
          'mermaid': ['mermaid'],
          'katex': ['katex'],
          '@babel/standalone': ['@babel/standalone'],
        }
      }
    }
  },

})
