import { createContext } from "react";

export interface PageScrollPosition {
  top: number;
  left: number;
  anchor?: { id: string; offset: number };
}

export interface PageScrollController {
  capture(): PageScrollPosition | null;
  restore(position: PageScrollPosition): void;
  ready(): boolean;
}

/** 阅读位置属于页面实例；正文的订阅和保存仍由原有会话管理。 */
export class PageViewport {
  element: HTMLDivElement | null = null;
  bounds?: { left: number; top: number; width: number; height: number };
  active = false;
  private controllers = new Map<string, PageScrollController>();
  private positions = new Map<string, PageScrollPosition>();
  private pending = new Set<string>();
  private params: string;

  constructor(
    params: Record<string, unknown>,
    private notify: () => void
  ) {
    this.params = JSON.stringify(params);
  }

  updateParams(params: Record<string, unknown>) {
    const signature = JSON.stringify(params);
    if (signature === this.params) return;
    this.params = signature;
    this.positions.clear();
    this.pending.clear();
  }

  get restoring() {
    return this.pending.size > 0;
  }

  get hasPosition() {
    return this.positions.size > 0;
  }

  register(key: string, controller: PageScrollController) {
    this.controllers.set(key, controller);
    this.restore(key);
    return () => {
      if (this.controllers.get(key) === controller) this.controllers.delete(key);
    };
  }

  capture = () => {
    // 准备中的目标页尚未展示，不能用它的 Loading/零偏移覆盖原位置。
    if (!this.element?.hasAttribute("data-page-active")) return;
    const { left, top, width, height } = this.element.getBoundingClientRect();
    this.bounds = { left, top, width, height };
    for (const [key, controller] of this.controllers) {
      const position = controller.capture();
      if (position) this.positions.set(key, position);
    }
    this.pending = new Set(this.positions.keys());
  };

  restore(key: string) {
    if (!this.active || !this.pending.has(key)) return;
    const controller = this.controllers.get(key);
    const position = this.positions.get(key);
    if (!position || !controller?.ready()) return;
    try {
      controller.restore(position);
    } catch (error) {
      console.warn("[page] 阅读位置恢复失败", error);
    } finally {
      this.complete(key);
    }
  }

  complete(key: string) {
    if (this.pending.delete(key)) this.notify();
  }

  cancel() {
    if (!this.pending.size) return;
    this.pending.clear();
    this.notify();
  }
}

export const PageViewportContext = createContext<PageViewport | null>(null);

/** 形变捕获新画面前，也要等正文的位置准备完成；此阶段浏览器暂停 rAF。 */
export function waitForPagePresentation(): Promise<void> {
  if (!document.querySelector("[data-page-preparing]")) return Promise.resolve();
  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      if (document.querySelector("[data-page-preparing]")) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-page-preparing"],
      childList: true,
    });
  });
}
