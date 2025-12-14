/// <reference types="vite-electron-plugin/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    VSCODE_DEBUG?: "true";
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬ dist-electron
     * │ ├─┬ main
     * │ │ └── index.js    > Electron-Main
     * │ └─┬ preload
     * │   └── index.mjs   > Preload-Scripts
     * ├─┬ dist
     * │ └── index.html    > Electron-Renderer
     * ```
     */
    APP_ROOT: string;
    /** /dist/ or /public/ */
    VITE_PUBLIC: string;
  }
}

// 7zip-min 类型声明
declare module "7zip-min" {
  export function unpack(
    archivePath: string,
    destDir: string,
    callback: (err: Error | null) => void
  ): void;

  export function pack(
    sourcePath: string,
    archivePath: string,
    callback: (err: Error | null) => void
  ): void;

  export function list(
    archivePath: string,
    callback: (err: Error | null, result: Array<{ name: string; size: number }>) => void
  ): void;
}
