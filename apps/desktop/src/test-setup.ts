if (typeof window !== "undefined") await import("vitest-canvas-mock");
import log from "electron-log";

// React 18+ act() 环境声明：集中配置，测试文件不再各自散落重复
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 不实现滚动方法，组件的滚动回调仍应正常执行。
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => undefined;
}

// 测试进程禁止写真实日志文件：electron-log 在纯 Node 环境会 fallback 到
// %APPDATA%/<package.name>/logs/main.log，与运行中应用的日志文件同路径，
// 会造成测试日志污染应用日志（曾导致误判）。需要测文件写入的用例自行 mock。
log.transports.file.level = false;

if (typeof URL !== "undefined" && typeof URL.createObjectURL !== "function") {
  (URL as any).createObjectURL = () => "blob:mock-url";
}

if (typeof URL !== "undefined" && typeof URL.revokeObjectURL !== "function") {
  (URL as any).revokeObjectURL = () => {};
}

if (typeof globalThis.Worker !== "function") {
  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor(_scriptURL: string | URL, _options?: WorkerOptions) {}
    postMessage(_message: unknown) {}
    terminate() {}
    addEventListener(_type: string, _listener: EventListenerOrEventListenerObject) {}
    removeEventListener(_type: string, _listener: EventListenerOrEventListenerObject) {}
    dispatchEvent(_event: Event): boolean {
      return true;
    }
  }

  (globalThis as any).Worker = MockWorker;
  if (typeof window !== "undefined") {
    (window as any).Worker = MockWorker;
  }
}
