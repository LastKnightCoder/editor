import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Transforms } from "slate";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { afterEach, expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { getChatDatabase, setChatDatabase } from "@/services/chatDatabase";
import {
  bindActiveEditingSessionEditor,
  upsertActiveEditingSession,
  removeActiveEditingSession,
} from "@/services/content-editing/active-editor-session";
import type { ChatSessionRow } from "@/types/chat-session";
import type { ChatConversationTurn } from "@/types/pi-session";
import chatRefExtension from "..";
import { activeWritableEditor } from "../operations";
import { ChatRefMenu } from "../components/ChatRefMenu";
import { chatRefQueryKey, loadChatRefTarget } from "../queries";
import { chatRefFailureText, chatRefTranslator } from "../i18n";

const io = vi.hoisted(() => ({
  get: vi.fn(),
  turn: vi.fn(),
  copy: vi.fn(),
  dock: vi.fn(),
  page: vi.fn(),
}));
vi.mock("@/commands/chat-session", () => ({ getChatSession: io.get }));
vi.mock("@/commands/piSession", () => ({ piSessionTurn: io.turn }));
vi.mock("@/features/chat/openInDock", () => ({
  useChatTitle: () => undefined,
  openChatInDock: io.dock,
}));
vi.mock("@/services/page-navigation", () => ({ openPage: io.page }));
vi.mock("@/utils/window-role", () => ({ isMainWindow: () => true }));
vi.mock("@/hooks/useTheme", () => ({ default: () => ({ isDark: false }) }));
vi.mock("@/components/ChatUI/useChatMarkdownComponents", () => ({
  useChatMarkdownComponents: () => ({}),
}));
// Markdown rendering is outside the reference/query lifecycle; raw question/answer props remain observable.
vi.mock("@/components/ChatSidebar/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div data-reference-markdown>{content}</div>,
}));

const row: ChatSessionRow = {
  id: "session-original",
  scope: "main-chat",
  domainRef: null,
  sessionFile: "/session/original.jsonl",
  cwd: "/original",
  title: "用户对话原标题",
  titleDirty: false,
  groupId: null,
  orderNum: null,
  archived: false,
  source: "desktop",
  messageCount: 3,
  createTime: 1,
  updateTime: 2,
};
const turn: ChatConversationTurn = {
  entryId: "entry-original",
  turn: 2,
  turns: 3,
  ask: "用户问题原文",
  answer: "AI回答原文 保留摘录",
  time: 2,
  onPath: false,
  model: "original-model",
};
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const done of cleanup.splice(0)) await done();
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function mount(withMenu = false) {
  const locale = desktopLocaleSource.getSnapshot(),
    database = getChatDatabase();
  setChatDatabase("reference-test-db");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container),
    ref = createRef<EditorRef>();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const kit = createEditorKit({ extensions: [chatRefExtension] });
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <QueryClientProvider client={client}>
          <DndProvider backend={HTML5Backend}>
            <Editor
              ref={ref}
              kit={kit}
              readonly={false}
              initValue={[
                {
                  type: "paragraph",
                  children: [
                    { type: "formatted", text: "正文之前 " },
                    {
                      type: "chat-ref",
                      sessionId: row.id,
                      entryId: turn.entryId,
                      title: row.title,
                      turn: turn.turn,
                      children: [{ type: "formatted", text: "" }],
                    },
                    { type: "formatted", text: " 正文之后" },
                  ],
                },
              ]}
            />
            {withMenu && (
              <div className="group/msg">
                <span data-answer>前文 保留选区原文 后文</span>
                <ChatRefMenu
                  getPayload={() => ({
                    sessionId: row.id,
                    entryId: turn.entryId,
                    title: row.title,
                    turn: turn.turn,
                    model: turn.model,
                  })}
                  quoteText="整条回答原文"
                />
              </div>
            )}
          </DndProvider>
        </QueryClientProvider>
      </I18nRuntimeProvider>
    )
  );
  cleanup.push(async () => {
    await act(async () => root.unmount());
    container.remove();
    client.clear();
    setChatDatabase(database);
    desktopLocaleSource.setLocale(locale);
  });
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("Reference editor unavailable");
  return { container, client, editor, ref };
}

it("预览在途读取跨语保持同一查询、引用与选区，读取完成后保留原问答和复制目标", async () => {
  await import("../components/ChatRefPreviewContent");
  let respond: ((row: ChatSessionRow) => void) | undefined;
  io.get.mockImplementation(
    () =>
      new Promise<ChatSessionRow>(resolve => {
        respond = resolve;
      })
  );
  io.turn.mockResolvedValue({ ok: true, turn });
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: io.copy.mockResolvedValue(undefined) },
  });
  cleanup.push(async () => {
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  });
  const { container, client, editor, ref } = await mount();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const trigger = container.querySelector('[data-slate-inline="true"]');
  if (!(trigger instanceof HTMLElement)) throw new Error("Reference trigger unavailable");
  await act(async () => {
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(450);
  });
  const key = chatRefQueryKey(row.id, turn.entryId),
    query = client.getQueryCache().find({ queryKey: key });
  const nodes = editor.children,
    selection = structuredClone(editor.selection);
  const panel = document.querySelector("[data-float-card]");
  if (!panel || !query) throw new Error("Reference preview unavailable");
  for (const language of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(language));
    expect(ref.current?.getEditor()).toBe(editor);
    expect(container.querySelector('[data-slate-inline="true"]')).toBe(trigger);
    expect(document.querySelector("[data-float-card]")).toBe(panel);
    expect(client.getQueryCache().find({ queryKey: key })).toBe(query);
    expect(editor.children).toBe(nodes);
    expect(editor.selection).toEqual(selection);
    expect(io.get).toHaveBeenCalledExactlyOnceWith(row.id, "reference-test-db");
    expect(io.turn).not.toHaveBeenCalled();
    expect(io.copy).not.toHaveBeenCalled();
  }
  await act(async () => {
    respond?.(row);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(io.turn).toHaveBeenCalledExactlyOnceWith(
    { sessionFile: row.sessionFile, databaseName: "reference-test-db" },
    turn.entryId
  );
  const raw = [...panel.querySelectorAll("[data-reference-markdown]")].map(
    node => node.textContent
  );
  expect(raw).toEqual([turn.ask, turn.answer]);
  const data = client.getQueryData(key);
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(client.getQueryData(key)).toBe(data);
  expect(editor.children).toBe(nodes);
  const copy = [...panel.querySelectorAll("button")].find(
    button => button.getAttribute("aria-label") === chatRefTranslator.t("copy.reference")
  );
  if (!copy) throw new Error("Copy reference action unavailable");
  await act(async () => copy.click());
  expect(io.copy).toHaveBeenCalledExactlyOnceWith(
    "tau://chat/session-original?entry=entry-original"
  );
});

it("打开引用菜单后换语不丢选中文字，只在选择摘录时写入原正文和出处一次", async () => {
  const { container, editor, ref } = await mount(true);
  const sessionId = "chat-reference-editor";
  upsertActiveEditingSession({
    sessionId,
    contentId: 51,
    entityType: "card",
    entityId: 51,
    content: editor.children,
  });
  bindActiveEditingSessionEditor(sessionId, editor);
  cleanup.push(async () => {
    removeActiveEditingSession(sessionId);
    window.getSelection()?.removeAllRanges();
  });
  if (activeWritableEditor() !== editor) throw new Error("Writable editor fixture unavailable");
  const answer = container.querySelector("[data-answer]")?.firstChild;
  if (!answer) throw new Error("Answer text unavailable");
  const range = document.createRange();
  range.setStart(answer, 3);
  range.setEnd(answer, 9);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  const selected = window.getSelection()?.toString();
  expect(selected).toBe("保留选区原文");
  const trigger = container.querySelector('[class="group/msg"] button');
  if (!(trigger instanceof HTMLButtonElement))
    throw new Error("Reference menu trigger unavailable");
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
  await act(async () => trigger.click());
  const menu = document.querySelector('[role="menu"]');
  if (!menu) throw new Error("Reference menu unavailable");
  const nodes = editor.children;
  for (const language of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(language));
    expect(document.querySelector('[role="menu"]')).toBe(menu);
    expect(ref.current?.getEditor()).toBe(editor);
    expect(editor.children).toBe(nodes);
    expect(io.copy).not.toHaveBeenCalled();
  }
  const action = [...menu.querySelectorAll('[role="menuitem"]')].find(
    node => node.textContent?.trim() === chatRefTranslator.t("quote.selection")
  );
  if (!(action instanceof HTMLElement)) throw new Error("Quote selection action unavailable");
  await act(async () => action.click());
  const quotes = [
    ...SlateEditor.nodes(editor, {
      at: [],
      match: node => "type" in node && node.type === "chat-quote",
    }),
  ];
  expect(quotes.map(([node]) => node)).toEqual([
    {
      type: "chat-quote",
      sessionId: row.id,
      entryId: turn.entryId,
      quoteText: selected,
      title: row.title,
      turn: turn.turn,
      model: turn.model,
      children: [{ type: "formatted", text: "" }],
    },
  ]);
});

it("只有自产空失败附稳定身份，未知服务诊断保持原文", async () => {
  io.get.mockResolvedValue(row);
  io.turn.mockResolvedValueOnce({ ok: false });
  const failure = await loadChatRefTarget(row.id, turn.entryId, "reference-test-db").catch(
    cause => cause
  );
  expect(failure).toMatchObject({ code: "CHAT_REF_READ_FAILED" });
  io.turn.mockResolvedValueOnce({ ok: false, error: "remote raw diagnostic 中文原文" });
  const unknown = await loadChatRefTarget(row.id, turn.entryId, "reference-test-db").catch(
    cause => cause
  );
  expect(unknown).toBeInstanceOf(Error);
  expect(chatRefFailureText(new Error(""), "open.failed")).toBe("");
  expect(chatRefFailureText(unknown, "read.failed")).toBe("remote raw diagnostic 中文原文");
});
