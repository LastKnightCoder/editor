declare module "github-api";
declare module "reactjs-calendar-heatmap";

interface Window {
  checkUpdate: () => Promise<void>;
  electron: {
    invoke: (command: string, ...args: any[]) => Promise<any>;
    on: (command: string, callback: (...args: any[]) => void) => void;
    off: (command: string, callback: (...args: any[]) => void) => void;
    send: (command: string, ...args: any[]) => void;
    sendSync: (command: string, ...args: any[]) => any;
    platform: string;
  };
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
  static registerPaint(
    name: string,
    classRef: new () => PaintRenderingContext2D,
  ): void;
}

interface PaintRenderingContext2D extends CanvasRenderingContext2D {
  readonly paintingWidth: number;
  readonly paintingHeight: number;
}

declare const registerPaint: typeof PaintWorkletGlobalScope.registerPaint;
