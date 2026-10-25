/** 伴读库标签页：记住打开过的那一个，再次打开时切过去（带页面键则跳到该页），关掉了就新开 */
import type { LibraryOpener } from "./hub";

export interface TabsLike {
  create(props: { url: string }): Promise<{ id?: number }>;
  update(
    tabId: number,
    props: { url?: string; active: boolean }
  ): Promise<{ windowId?: number } | undefined>;
  focusWindow(windowId: number): Promise<unknown>;
}

export const libraryUrl = (base: string, page?: string) =>
  page ? `${base}?${new URLSearchParams({ page })}` : base;

export class LibraryTab implements LibraryOpener {
  private tabId: number | undefined;

  constructor(
    private readonly tabs: TabsLike,
    private readonly baseUrl: string
  ) {}

  async open(page?: string): Promise<void> {
    if (this.tabId !== undefined) {
      try {
        const props = page
          ? { url: libraryUrl(this.baseUrl, page), active: true }
          : { active: true };
        const tab = await this.tabs.update(this.tabId, props);
        if (tab) {
          if (tab.windowId !== undefined) await this.tabs.focusWindow(tab.windowId);
          return;
        }
      } catch {
        // 标签页已关闭
      }
    }
    this.tabId = (await this.tabs.create({ url: libraryUrl(this.baseUrl, page) })).id;
  }
}
