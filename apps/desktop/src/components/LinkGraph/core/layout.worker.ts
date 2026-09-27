/// <reference lib="webworker" />

/** 布局 worker：只做消息分发，力模拟与缓冲协议在 layoutRunner 里（可单测）。 */

import { LayoutRunner } from "./layoutRunner";
import type { LayoutRequest, LayoutResponse } from "./layoutTypes";

const runner = new LayoutRunner({
  post: (message: LayoutResponse, transfer: Transferable[]) => self.postMessage(message, transfer),
});

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  runner.handle(event.data);
};
