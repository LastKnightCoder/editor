declare module "github-api";
declare module "reactjs-calendar-heatmap";
declare module "plantuml-encoder";

interface ElectronAPI {
  // invoke/send/on/off/sendLog 的类型声明见 src/rpc/electron-bridge.d.ts
  platform: string;
  windowRole?: string;
  /** 拖入文件的本机路径；非 Electron 环境缺省 */
  getPathForFile?: (file: File) => string;
}

interface Window {
  cheerpjInit: boolean;
  checkUpdate: () => Promise<void>;
  electron: ElectronAPI;
}

declare namespace CSS {
  interface PaintWorklet {
    addModule(url: string): Promise<void>;
  }
  const paintWorklet: PaintWorklet;
}

declare module "css-paint-polyfill" {
  export function install(): void;
}

declare class PaintWorkletGlobalScope {
  static registerPaint(name: string, classRef: new () => PaintRenderingContext2D): void;
}

interface PaintRenderingContext2D extends CanvasRenderingContext2D {
  readonly paintingWidth: number;
  readonly paintingHeight: number;
}

declare const registerPaint: typeof PaintWorkletGlobalScope.registerPaint;
