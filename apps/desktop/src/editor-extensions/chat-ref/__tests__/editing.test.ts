import { createEditor, Node, Text, Transforms } from "slate";
import { withHistory } from "slate-history";
import { ReactEditor } from "slate-react";
import { Doc } from "yjs";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "@tau/editor-collab";
import { afterEach, expect, it, vi } from "vitest";
import chatRefExtension from "..";
import { insertChatRef } from "../operations";
import { loadChatRefTarget } from "../queries";
import { getChatDatabase, setChatDatabase } from "@/services/chatDatabase";

const commands = vi.hoisted(() => ({ get: vi.fn(), turn: vi.fn() }));
vi.mock("@/commands/chat-session", () => ({ getChatSession: commands.get }));
vi.mock("@/commands/piSession", () => ({ piSessionTurn: commands.turn }));

const ref = { sessionId: "s", entryId: "u", title: "对话", text: "摘录内容" };
const text = (value: string) => ({ type: "formatted" as const, text: value });
const body = { type: "paragraph" as const, children: [text("正文")] };
const paste = chatRefExtension.elements?.find(element => element.type === "chat-ref")?.ingest?.text;
const data = {
  getData: (type: string) => (type === "text/plain" ? "tau://chat/s?entry=u" : ""),
} as DataTransfer;

afterEach(() => vi.restoreAllMocks());

it("正文节点树持久化摘录块和出处", () => {
  const doc = new Doc();
  const tree = new NodeTree(doc);
  tree.insertNode({ ...body, collabId: "body" }, null, 0, null, true);
  const editor = createEditor();
  editor.isVoid = node => node.type === "chat-quote";
  const binding = createNodeTreeDocument(tree).binding;
  if (!binding) throw new Error("缺少正文节点树绑定");
  binding.install(editor);
  binding.connect(editor);
  try {
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    expect(insertChatRef(editor, ref, "quote")).toBe(true);
    expect(Text.isText(editor.children[1])).toBe(false);
    expect(tree.read()[1]).toMatchObject({
      type: "chat-quote",
      sessionId: "s",
      entryId: "u",
      quoteText: "摘录内容",
    });
  } finally {
    binding.disconnect(editor);
    (editor as unknown as { undoManager: { destroy(): void } }).undoManager.destroy();
    doc.destroy();
  }
});

it("跨代码块的选区交给默认粘贴，直接插入也不会进入代码块", () => {
  for (const blocks of [
    [{ type: "code-block", children: [text("代码")] }, body],
    [body, { type: "code-block", children: [text("代码")] }],
  ]) {
    const editor = createEditor();
    editor.children = blocks as never;
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    expect(paste?.when(data, editor)).toBe(false);
    expect(insertChatRef(editor, ref, "inline")).toBe(false);
    expect(editor.children).toEqual(blocks);
  }
});

it("异步粘贴保留落点、一次写入标题和轮次，撤销一次即可移除引用", async () => {
  const editor = withHistory(createEditor());
  editor.isInline = element => element.type === "chat-ref";
  editor.isVoid = element => element.type === "chat-ref";
  editor.children = [body];
  const host = document.createElement("div");
  document.body.append(host);
  vi.spyOn(ReactEditor, "toDOMNode").mockReturnValue(host);
  Transforms.select(editor, { path: [0, 0], offset: 1 });
  let respond!: (row: unknown) => void;
  commands.get.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        respond = resolve;
      })
  );
  commands.turn.mockResolvedValueOnce({ ok: true, turn: { turn: 2 } });
  try {
    expect(paste?.when(data, editor)).toBe(true);
    const pending = paste?.run({ editor, data, source: "paste" });
    Transforms.insertText(editor, "新", { at: { path: [0, 0], offset: 0 } });
    respond({ title: "对话快照", scope: "main-chat", sessionFile: "s.jsonl" });
    await pending;
    expect(Node.get(editor, [0, 0])).toMatchObject({ text: "新正" });
    expect(Node.get(editor, [0, 1])).toMatchObject({
      type: "chat-ref",
      title: "对话快照",
      turn: 2,
    });
    editor.undo();
    expect(Node.get(editor, [0, 0])).toMatchObject({ text: "新正文" });
    expect(editor.children).toHaveLength(1);
    expect([...Node.nodes(editor)].some(([node]) => node.type === "chat-ref")).toBe(false);
  } finally {
    host.remove();
  }
});

it("切库期间查询沿用请求发起时的资料库", async () => {
  const original = getChatDatabase();
  let respond!: (row: unknown) => void;
  commands.get.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        respond = resolve;
      })
  );
  commands.turn.mockResolvedValueOnce({ ok: true, turn: null });
  try {
    setChatDatabase("库一");
    const pending = loadChatRefTarget("s", "u");
    setChatDatabase("库二");
    respond({ title: "库一对话", scope: "main-chat", sessionFile: "s.jsonl" });
    await pending;
    expect(commands.get).toHaveBeenLastCalledWith("s", "库一");
    expect(commands.turn).toHaveBeenLastCalledWith(
      { sessionFile: "s.jsonl", databaseName: "库一" },
      "u"
    );
  } finally {
    setChatDatabase(original);
  }
});
