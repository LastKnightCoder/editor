import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  prepared: null as unknown,
  created: null as unknown,
  writes: [] as string[],
  customTitle: null as string | null,
}));

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../database", () => ({
  default: {
    getCurrentDatabase: () => ({ open: true, name: "/tmp/main.db" }),
    notifyExternalWrite: (event: string) => env.writes.push(event),
  },
}));
vi.mock("../database-notifications", () => ({ broadcastDatabaseChange: vi.fn() }));
vi.mock("../tables/excerpt", () => ({
  default: {},
  WEB_EXCERPT_SYNCED_EVENT: "excerpt:sync-web-page",
}));
vi.mock("../tables/web-page", () => ({
  default: { displayTitle: () => env.customTitle },
}));
vi.mock("../tables/card", () => ({
  default: {
    createCard: (_db: unknown, card: unknown) => {
      env.created = card;
      return { id: 42 };
    },
  },
}));
vi.mock("../../services/content-execution", () => ({
  contentExecutor: {
    execute: async (request: { input: { nodes: unknown } }) => {
      env.prepared = request.input.nodes;
      return { content: request.input.nodes };
    },
  },
}));

import { saveNote } from "../browser-companion/library";

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });

beforeEach(() => {
  env.prepared = null;
  env.created = null;
  env.writes = [];
  env.customTitle = null;
});

describe("saveNote", () => {
  it("编辑器节点原样存为卡片，末尾附来源链接", async () => {
    const content = [{ type: "header", level: 2, children: [text("要点")] }, paragraph("正文")];
    await expect(
      saveNote({ url: "https://a.com/x#h", title: "一篇文章", content })
    ).resolves.toEqual({ cardId: 42 });
    expect(env.prepared).toEqual([
      ...content,
      {
        type: "paragraph",
        children: [
          text("来源："),
          { type: "link", url: "https://a.com/x", children: [text("一篇文章")] },
          text(""),
        ],
      },
    ]);
    expect(env.created).toMatchObject({ tags: [], isTop: false });
    expect(env.writes).toContain("create-card");
  });

  it("页面起过名时来源段用起的名", async () => {
    env.customTitle = "React 19 新特性";
    await saveNote({
      url: "https://a.com/x",
      title: "React v19",
      content: [paragraph("正文")],
    });
    expect(JSON.stringify(env.prepared)).toContain("React 19 新特性");
    expect(JSON.stringify(env.prepared)).not.toContain("React v19");
  });

  it("拒绝空笔记、非法节点与非 http(s) 地址", async () => {
    await expect(saveNote({ url: "https://a.com", content: [paragraph("  ")] })).rejects.toThrow(
      "空的"
    );
    await expect(
      saveNote({ url: "https://a.com", content: [{ text: "裸文本" }] })
    ).rejects.toThrow();
    await expect(saveNote({ url: "https://a.com", content: "## markdown" })).rejects.toThrow();
    await expect(saveNote({ url: "file:///etc", content: [paragraph("x")] })).rejects.toThrow(
      "http"
    );
  });

  it("没有文字的分割线也算内容", async () => {
    await expect(
      saveNote({ url: "https://a.com", content: [{ type: "divide-line", children: [text("")] }] })
    ).resolves.toEqual({ cardId: 42 });
  });
});
