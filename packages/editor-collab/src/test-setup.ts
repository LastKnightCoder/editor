import "../../editor/src/test-setup";

// 协作光标的定位 hook 依赖 ResizeObserver，jsdom 没有
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
