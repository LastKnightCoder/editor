import { describe, expect, it, vi } from "vitest";
import type { PageHighlights } from "@/content/types";
import {
  EXCERPT_SYNC_STATE_PREFIX,
  pagePayload,
  syncHighlightsToDesktop,
  type ExcerptSyncDeps,
} from "../excerptSync";

const page = (url: string, ids: string[], title = "页"): PageHighlights => ({
  url,
  title,
  version: 1,
  highlights: ids.map((id, index) => ({
    id,
    range: {
      startXPath: "/p",
      startOffset: index,
      endXPath: "/p",
      endOffset: index + 1,
      text: `原文${id}`,
    },
    style: "marker",
    color: "pink",
    createdAt: 1,
  })),
  annotations: ids[0]
    ? {
        [ids[0]]: {
          highlightId: ids[0],
          text: "想法",
          isPublic: false,
          createdAt: 1,
          updatedAt: 1,
        },
      }
    : {},
});

function fakeDeps(initial: Record<string, unknown>, failUrls: string[] = []) {
  const store: Record<string, unknown> = { ...initial };
  const sent: Array<{ url: string; count: number }> = [];
  const deps: ExcerptSyncDeps = {
    request: vi.fn(async (method: string, params: any) => {
      if (method === "settings.getCurrentDatabase") return { dbName: "main.db" };
      if (failUrls.includes(params.url)) throw new Error("down");
      sent.push({ url: params.url, count: params.highlights.length });
      return { inserted: 0, updated: 0, deleted: 0 };
    }),
    storageGetAll: async () => ({ ...store }),
    storageSet: async items => {
      Object.assign(store, items);
    },
  };
  return { deps, store, sent };
}

describe("excerptSync", () => {
  it("快照带上批注、颜色与 XPath，URL 去掉 hash", () => {
    const payload = pagePayload(page("https://a.com/x#top", ["h1"]));
    expect(payload.url).toBe("https://a.com/x");
    expect(payload.highlights[0]).toMatchObject({
      id: "h1",
      text: "原文h1",
      note: "想法",
      color: "pink",
    });
  });

  it("只发变化的页；失败的页保持脏，下次再发", async () => {
    const pages = {
      "tau-highlights:https://a.com/x": page("https://a.com/x", ["h1"]),
      "tau-highlights:https://b.com/y": page("https://b.com/y", ["h2", "h3"]),
    };
    const first = fakeDeps(pages, ["https://b.com/y"]);
    expect(await syncHighlightsToDesktop(first.deps)).toEqual({ sent: 1, failed: 1 });

    const second = fakeDeps(first.store);
    expect(await syncHighlightsToDesktop(second.deps)).toEqual({ sent: 1, failed: 0 });
    expect(second.sent).toEqual([{ url: "https://b.com/y", count: 2 }]);

    const third = fakeDeps(second.store);
    expect(await syncHighlightsToDesktop(third.deps)).toEqual({ sent: 0, failed: 0 });
  });

  it("删掉划线后重发该页；整页从存储消失时发空快照并清掉记录", async () => {
    const first = fakeDeps({
      "tau-highlights:https://a.com/x": page("https://a.com/x", ["h1", "h2"]),
    });
    await syncHighlightsToDesktop(first.deps);

    const store = {
      ...first.store,
      "tau-highlights:https://a.com/x": page("https://a.com/x", ["h1"]),
    };
    const second = fakeDeps(store);
    await syncHighlightsToDesktop(second.deps);
    expect(second.sent).toEqual([{ url: "https://a.com/x", count: 1 }]);

    const gone = { ...second.store };
    delete gone["tau-highlights:https://a.com/x"];
    const third = fakeDeps(gone);
    await syncHighlightsToDesktop(third.deps);
    expect(third.sent).toEqual([{ url: "https://a.com/x", count: 0 }]);
    expect(third.store[`${EXCERPT_SYNC_STATE_PREFIX}main.db`]).toEqual({});
  });
});
