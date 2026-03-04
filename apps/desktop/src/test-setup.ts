import "vitest-canvas-mock";

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
    addEventListener(
      _type: string,
      _listener: EventListenerOrEventListenerObject,
    ) {}
    removeEventListener(
      _type: string,
      _listener: EventListenerOrEventListenerObject,
    ) {}
    dispatchEvent(_event: Event): boolean {
      return true;
    }
  }

  (globalThis as any).Worker = MockWorker;
  if (typeof window !== "undefined") {
    (window as any).Worker = MockWorker;
  }
}
