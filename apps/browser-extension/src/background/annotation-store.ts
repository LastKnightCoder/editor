/**
 * 标注的本机缓存与发件箱：Tau 是真相源，扩展按页缓存一份。
 * 没连上 Tau 时照常保存到本机并记为待同步，就绪后按页补发整页快照（annotations.sync 是快照语义）。
 */
import { COMPANION_METHODS, type WebAnnotation } from "@tau/shared/browser-companion";
import { pageKeyOf } from "../shared/messages";
import type { KeyValueStore } from "./connection";

interface CachedPage {
  title: string;
  items: WebAnnotation[];
}

const PAGE_PREFIX = "ann:";
const DIRTY_KEY = "ann.dirty";

export interface AnnotationRemote {
  isReady(): boolean;
  request<T>(method: string, params: unknown): Promise<T>;
}

export class AnnotationStore {
  constructor(
    private readonly storage: KeyValueStore,
    private readonly remote: AnnotationRemote
  ) {}

  private async dirty(): Promise<string[]> {
    return (await this.storage.get<string[]>(DIRTY_KEY)) ?? [];
  }

  private async setDirty(pageKey: string, isDirty: boolean): Promise<void> {
    const current = new Set(await this.dirty());
    if (isDirty === current.has(pageKey)) return;
    if (isDirty) current.add(pageKey);
    else current.delete(pageKey);
    await this.storage.set(DIRTY_KEY, [...current]);
  }

  async load(url: string): Promise<WebAnnotation[]> {
    const key = pageKeyOf(url);
    const cached = await this.storage.get<CachedPage>(PAGE_PREFIX + key);
    if (!this.remote.isReady()) return cached?.items ?? [];
    if ((await this.dirty()).includes(key) && cached) {
      await this.push(key, cached).catch(() => {});
      return cached.items;
    }
    try {
      const items = await this.remote.request<WebAnnotation[]>(COMPANION_METHODS.annotationsList, {
        url: key,
      });
      if (items.length)
        await this.storage.set(PAGE_PREFIX + key, { title: cached?.title ?? "", items });
      else await this.storage.remove(PAGE_PREFIX + key);
      return items;
    } catch {
      return cached?.items ?? [];
    }
  }

  async save(url: string, title: string, items: WebAnnotation[]): Promise<void> {
    const key = pageKeyOf(url);
    const page = { title, items };
    await this.storage.set(PAGE_PREFIX + key, page);
    await this.setDirty(key, true);
    if (this.remote.isReady()) await this.push(key, page).catch(() => {});
  }

  /** 就绪后补发离线期间改过的页 */
  async flush(): Promise<void> {
    for (const key of await this.dirty()) {
      const page = await this.storage.get<CachedPage>(PAGE_PREFIX + key);
      if (!page) {
        await this.setDirty(key, false);
        continue;
      }
      // 单页失败（参数不合规等）不挡其余页，留待下次就绪再试
      await this.push(key, page).catch(() => {});
    }
  }

  private async push(key: string, page: CachedPage): Promise<void> {
    await this.remote.request(COMPANION_METHODS.annotationsSync, {
      url: key,
      title: page.title,
      items: page.items,
    });
    await this.setDirty(key, false);
  }
}
