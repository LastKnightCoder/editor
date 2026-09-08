declare module "github-api";
declare module "reactjs-calendar-heatmap";
declare module "plantuml-encoder";

interface ElectronAPI {
  // bootstrap 的类型声明见 src/rpc/electron-bridge.d.ts（复用 @tau/rpc 的 RpcBootstrapInfo）
  platform: string;
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
