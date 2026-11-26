import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createWhiteboardSession,
  DOCUMENT_INSERT_EVENT,
  DOCUMENT_RELATED_EVENT,
  type Board,
  type DocumentElement,
} from "@tau/whiteboard";
import {
  createDocumentExtension,
  createWhiteboardReferenceExtension,
  createInteractionExtension,
} from "@tau/whiteboard/extensions";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import type { EntityCandidate, Whiteboard } from "@/types";
import type { ContextRelated } from "@/types/entity-context";
import { QuickInsertLayer } from "../components/Document/QuickInsertPanel";
import { MaterialShelf } from "../components/Document/MaterialShelf";
import { SuggestionLayer } from "../components/Document/SuggestionLayer";
import WhiteboardSelectorModal from "../components/WhiteboardSelectorModal";
import { MATERIAL_MIME } from "../components/Document/materialDrag";

const mocks = vi.hoisted(() => ({
  board: null as Board | null,
  search: vi.fn(),
  context: vi.fn(),
  related: vi.fn(),
  whiteboards: vi.fn(),
}));
vi.mock("@tau/whiteboard", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/whiteboard")>()),
  useBoard: () => mocks.board,
  useSelection: () => mocks.board?.selection,
  useViewPort: () => mocks.board?.viewPort,
}));
vi.mock("@/commands", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands")>()),
  searchEntities: mocks.search,
}));
vi.mock("@/commands/entity-context", () => ({
  getEntityContext: mocks.context,
  getEntityRelated: mocks.related,
}));
vi.mock("@/commands/white-board", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/white-board")>()),
  getAllWhiteboards: mocks.whiteboards,
}));

const now = new Date(2026, 10, 27, 10).getTime();
const candidates: EntityCandidate[] = [
  {
    kind: "card",
    id: 2,
    contentId: 12,
    title: "用户卡片原始标题",
    excerpt: "原始摘要",
    meta: "原始项目名",
    time: now,
  },
  {
    kind: "article",
    id: 3,
    contentId: 13,
    title: "用户文章原始标题",
    excerpt: "原始摘要",
    meta: "原始作者名",
    time: now - 86400000,
  },
];
const source: DocumentElement = {
  id: "source-card",
  type: "document",
  entityRef: { kind: "card", id: 1 },
  title: "来源原文标题",
  x: 0,
  y: 0,
  width: 260,
  height: 240,
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const sessions: ReturnType<typeof createWhiteboardSession>[] = [];
const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo");
const render = (node: React.ReactNode) =>
  act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <QueryClientProvider client={client}>{node}</QueryClientProvider>
      </I18nRuntimeProvider>
    )
  );
function sessionWith(children: DocumentElement[] = [], selected: DocumentElement[] = []) {
  const session = createWhiteboardSession(
    {
      children,
      viewPort: { minX: 0, minY: 0, width: 1000, height: 800, zoom: 1 },
      selection: { selectArea: null, selectedElements: selected },
      version: 2,
    },
    [
      createDocumentExtension({}),
      createWhiteboardReferenceExtension({}),
      createInteractionExtension(),
    ]
  );
  sessions.push(session);
  mocks.board = session.api;
  return session;
}
const inputValue = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const flush = () => act(async () => vi.advanceTimersByTimeAsync(200));
const options = () => [
  ...host.querySelectorAll<HTMLButtonElement | HTMLDivElement>('[role="option"]'),
];
beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollTo", {
    value: () => undefined,
    configurable: true,
  });
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  desktopLocaleSource.setLocale("zh-CN");
  mocks.search.mockResolvedValue(candidates);
  mocks.context.mockResolvedValue(null);
  mocks.related.mockResolvedValue([]);
  mocks.whiteboards.mockResolvedValue([]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  sessions.splice(0).forEach(session => session.dispose());
  client.clear();
  host.remove();
  mocks.board = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  desktopLocaleSource.setLocale("zh-CN");
  if (scrollToDescriptor) Object.defineProperty(Element.prototype, "scrollTo", scrollToDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollTo");
});

it("放入面板跨语言保留搜索与多选，不重查或提前放入，确认仍写原引用标题", async () => {
  const { api } = sessionWith();
  const release = vi.fn();
  await render(<QuickInsertLayer />);
  await act(async () => api.emit(DOCUMENT_INSERT_EVENT, { at: { x: 400, y: 300 }, release }));
  await flush();
  const input = host.querySelector("input");
  if (!input) throw new Error("quick insert input missing");
  await inputValue(input, "用户原始检索词");
  await flush();
  const row = options()[1];
  if (!row) throw new Error("insert option missing");
  await act(async () =>
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }))
  );
  input.focus();
  input.setSelectionRange(1, 3);
  const reads = mocks.search.mock.calls.length;
  for (const locale of ["zh-TW", "en-US"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("用户原始检索词");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    expect(options()[1]).toBe(row);
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(mocks.search).toHaveBeenCalledTimes(reads);
    expect(api.children).toEqual([]);
    expect(release).not.toHaveBeenCalled();
  }
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  );
  const insertedDocument = api.children.find(element => element.type === "document");
  expect(insertedDocument).toMatchObject({
    entityRef: { kind: "article", id: 3 },
    title: "用户文章原始标题",
  });
  expect(insertedDocument).not.toHaveProperty("note");
  expect(insertedDocument).not.toHaveProperty("reasonKind");
});

it("素材架已选项跨语言保持，拖拽仍传原始引用与标题且不把显示描述写进payload", async () => {
  const { api } = sessionWith();
  await render(<MaterialShelf />);
  await flush();
  const rows = options();
  for (const row of rows)
    await act(async () =>
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }))
    );
  const reads = mocks.search.mock.calls.length;
  for (const locale of ["zh-TW", "en-US"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(options()).toEqual(rows);
    expect(rows.map(row => row.getAttribute("aria-selected"))).toEqual(["true", "true"]);
    expect(mocks.search).toHaveBeenCalledTimes(reads);
    expect(api.children).toEqual([]);
  }
  const transfer = { effectAllowed: "", setData: vi.fn(), setDragImage: vi.fn() };
  const event = new Event("dragstart", { bubbles: true });
  Object.assign(event, { dataTransfer: transfer });
  await act(async () => rows[0].dispatchEvent(event));
  const payload = transfer.setData.mock.calls.find(([mime]) => mime === MATERIAL_MIME)?.[1];
  expect(JSON.parse(payload)).toEqual({
    targets: [
      { entityRef: { kind: "card", id: 2 }, title: "用户卡片原始标题" },
      { entityRef: { kind: "article", id: 3 }, title: "用户文章原始标题" },
    ],
  });
});

it("建议跨语言不重取或放入，点击保持旧额外持久字段并剔除唯一UI原因标识", async () => {
  const related: ContextRelated = {
    entity: { ref: { kind: "article", id: 9 }, title: "推荐原始标题", meta: "raw metadata" },
    summary: "AI 推荐正文原样保留",
  };
  mocks.related.mockResolvedValue([related]);
  const { api } = sessionWith([source], [source]);
  await render(<SuggestionLayer />);
  await act(async () => api.emit(DOCUMENT_RELATED_EVENT, source.id));
  await flush();
  const row = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button =>
    button.textContent?.includes(related.entity.title)
  );
  if (!row) throw new Error("related suggestion missing");
  const original = api.children[0];
  for (const locale of ["zh-TW", "en-US"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect([...host.querySelectorAll("button")]).toContain(row);
    expect(api.children).toEqual([original]);
    expect(mocks.related).toHaveBeenCalledOnce();
    expect(mocks.context).toHaveBeenCalledOnce();
    expect(row.textContent).toContain(related.summary);
  }
  await act(async () => row.click());
  const inserted = api.children.find(
    element => element.type === "document" && element.id !== source.id
  );
  expect(inserted).toMatchObject({
    entityRef: { kind: "article", id: 9 },
    title: "推荐原始标题",
    key: "article:9",
    kind: "article",
    reason: "内容相近",
    summary: "AI 推荐正文原样保留",
  });
  expect(inserted).not.toHaveProperty("reasonKind");
});

it("引用白板的挂起读取与搜索草稿跨语言保持，确认仍用原白板ID和真实标题", async () => {
  const target: Whiteboard = {
    id: 41,
    title: "用户白板原始标题",
    description: "描述原文",
    tags: [],
    whiteboardContentIds: [],
    whiteboardContentList: [],
    activeWhiteboardContentId: null,
    createTime: now,
    updateTime: now,
    snapshot: "",
  };
  let done!: (items: Whiteboard[]) => void;
  mocks.whiteboards.mockReturnValue(
    new Promise<Whiteboard[]>(resolve => {
      done = resolve;
    })
  );
  const { api } = sessionWith();
  const close = vi.fn();
  await render(<WhiteboardSelectorModal open action="reference" onClose={close} board={api} />);
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(mocks.whiteboards).toHaveBeenCalledOnce();
  await act(async () => done([target]));
  await flush();
  const input = document.querySelector("input");
  if (!input) throw new Error("whiteboard search missing");
  await inputValue(input, "用户白板");
  input.focus();
  input.setSelectionRange(1, 3);
  for (const locale of ["en-US", "zh-CN"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("用户白板");
    expect(mocks.whiteboards).toHaveBeenCalledOnce();
    expect(api.children).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  }
  const row = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button =>
    button.textContent?.includes(target.title)
  );
  if (!row) throw new Error("whiteboard option missing");
  await act(async () => row.click());
  expect(api.children[0]).toMatchObject({
    type: "whiteboard",
    whiteboardId: target.id,
    name: target.title,
  });
});
