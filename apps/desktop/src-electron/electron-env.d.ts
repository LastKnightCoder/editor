/// <reference types="vite-electron-plugin/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    VSCODE_DEBUG?: "true";
    /**
     * 构建产物目录结构
     *
     * ```tree
     * ├─┬ dist-electron
     * │ ├─┬ main
     * │ │ └── index.js    > 主进程
     * │ └─┬ preload
     * │   └── index.mjs   > 预加载脚本
     * ├─┬ dist
     * │ └── index.html    > 渲染进程
     * ```
     */
    APP_ROOT: string;
    /** /dist/ 或 /public/ */
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

  export function config(cfg: { binaryPath?: string }): void;
}
