// React 组件测试需要声明 act 环境，避免测试输出噪声告警。
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: () => "blob:mock-url",
  });
}

if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: () => {},
  });
}

if (typeof Worker === "undefined") {
  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;

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
  }

  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: MockWorker,
  });
}
