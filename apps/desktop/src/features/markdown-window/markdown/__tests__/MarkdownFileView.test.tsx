import { act, createRef, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Editor as SlateEditor } from "slate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MarkdownViewHandle } from "../../types";

const state = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(async () => undefined),
  changed: undefined as
    ((event: unknown, payload: { filePath: string }) => Promise<void>) | undefined,
  editor: undefined as SlateEditor | undefined,
  source: undefined as
    { edit(text: string): void; undo(): void; redo(): void; getValue(): string } | undefined,
  mounts: 0,
  effects: 0,
}));
vi.mock("@/commands/file", () => ({
  readTextFile: state.read,
  writeTextFile: state.write,
  watchTextFile: vi.fn(async () => undefined),
  unwatchTextFile: vi.fn(async () => undefined),
  onTextFileChanged: (listener: typeof state.changed) => {
    state.changed = listener;
  },
  offTextFileChanged: (listener: typeof state.changed) => {
    if (state.changed === listener) state.changed = undefined;
  },
}));
vi.mock("@/utils", async () => ({
  ...(await import("@/utils/markdown")),
  getContentLength: (nodes: unknown) => JSON.stringify(nodes).length,
}));
vi.mock("@/components/ContentOutline", () => ({
  extractContentHeaders: () => [],
  resolveEditorHeaderAnchor: () => null,
}));
vi.mock("../editorServices", async () => {
  const { createEditorKit, defineExtension } = await import("@tau/editor");
  const { createElement, useEffect, useState } = await import("react");
  const kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.file-blocks",
        elements: [
          {
            type: "code-block",
            kind: "block",
            isVoid: true,
            render: function Probe({ attributes, children }) {
              useState(() => ++state.mounts);
              useEffect(() => {
                state.effects++;
              }, []);
              return createElement("div", attributes, children);
            },
          },
        ],
      }),
    ],
  });
  return { useMarkdownEditorServices: () => kit };
});
vi.mock("@tau/editor", async importOriginal => {
  const actual = await importOriginal<typeof import("@tau/editor")>();
  const { forwardRef, createElement } = await import("react");
  return {
    ...actual,
    Editor: forwardRef<import("@tau/editor").EditorRef, React.ComponentProps<typeof actual.Editor>>(
      (props, ref) =>
        createElement(actual.Editor, {
          ...props,
          ref: value => {
            state.editor = value?.getEditor();
            if (typeof ref === "function") ref(value);
            else if (ref) ref.current = value;
          },
        })
    ),
  };
});
// 仅替代 CodeMirror 的 DOM 布局引擎，仍运行真实视图、文件会话及 Y.Doc/Slate 绑定。
vi.mock("react-codemirror2", async () => {
  const { createElement, useEffect, useRef, useState } = await import("react");
  return {
    UnControlled: (props: {
      value: string;
      editorDidMount(editor: unknown): void;
      onChange(editor: unknown, change: { origin: string }, text: string): void;
    }) => {
      const latest = useRef(props);
      latest.current = props;
      const [text, setText] = useState(props.value);
      const [editor] = useState(() => {
        let value = props.value,
          cursor = { line: 0, ch: 0 };
        const instance = {
          getValue: () => value,
          setValue: (next: string) => {
            value = next;
            setText(next);
            latest.current.onChange(instance, { origin: "setValue" }, next);
          },
          edit: (next: string) => {
            value = next;
            setText(next);
            latest.current.onChange(instance, { origin: "+input" }, next);
          },
          getCursor: () => cursor,
          setCursor: (next: typeof cursor) => {
            cursor = next;
          },
          lastLine: () => value.split("\n").length - 1,
          getLine: (line: number) => value.split("\n")[line] ?? "",
          on: vi.fn(),
          off: vi.fn(),
          clearHistory: vi.fn(),
          focus: vi.fn(),
          refresh: vi.fn(),
          undo: vi.fn(),
          redo: vi.fn(),
          getWrapperElement: () => document.body,
        };
        return instance;
      });
      useEffect(() => {
        state.source = editor;
        latest.current.editorDidMount(editor);
      }, [editor]);
      return createElement("output", { "data-source": true }, text);
    },
  };
});

import { MarkdownFileView } from "../MarkdownFileView";

let dispose: (() => Promise<void>) | undefined;
beforeEach(() => {
  state.read.mockReset();
  state.write.mockClear();
  state.mounts = 0;
  state.effects = 0;
  state.source = undefined;
  state.editor = undefined;
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

async function mount(text: string, strict = false) {
  state.read.mockResolvedValue(text);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<MarkdownViewHandle>();
  const view = (
    <DndProvider backend={HTML5Backend}>
      <MarkdownFileView
        ref={ref}
        path="/test/doc.md"
        wide={false}
        onStatus={() => undefined}
        onOpenMarkdown={() => undefined}
        onSaveAs={() => undefined}
      />
    </DndProvider>
  );
  await act(async () => root.render(strict ? <StrictMode>{view}</StrictMode> : view));
  dispose = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  if (!state.editor || !state.source || !ref.current) throw new Error("文件编辑器未就绪");
  return { editor: state.editor, source: state.source, view: ref.current, host };
}

it("打开不改写文件；外部插入保留编辑器及未修改块实例", async () => {
  const raw = "正文\n\n```js\nconst a = 1;\n```\n";
  const { editor, view } = await mount(raw);
  const block = editor.children[1];
  expect(state.mounts).toBe(1);
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
  const external = "新增\n\n" + raw;
  state.read.mockResolvedValue(external);
  await act(async () => state.changed?.({}, { filePath: "/test/doc.md" }));
  expect(state.editor).toBe(editor);
  expect(editor.children[2]).toBe(block);
  expect(state.mounts).toBe(1);
  expect(view.getMarkdown()).toBe(external);
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
});

it("无法投影的原文自动进入源码，修复后继续保存且不丢原文", async () => {
  const raw =
    ':tau-node[]{type="formatted" json="{&quot;type&quot;:&quot;formatted&quot;,&quot;text&quot;:&quot;&quot;,&quot;vendor&quot;:true}"}';
  const { source, view, host } = await mount(raw);
  expect(host.textContent).toContain("原文已保留");
  expect(source.getValue()).toBe(raw);
  expect(host.querySelector('[aria-pressed="true"]')).not.toBeNull();
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
  await act(async () => source.edit("已修复正文"));
  await act(async () => view.flush());
  expect(host.textContent).not.toContain("原文已保留");
  expect(state.write).toHaveBeenCalledWith("/test/doc.md", "已修复正文");
  await act(async () => source.undo());
  expect(view.getMarkdown()).toBe(raw);
});

it("源码切换常驻同一编辑器，源码与富文本共用撤销", async () => {
  const { editor, source, view } = await mount("正文");
  await act(async () => Transforms.insertText(editor, "本地", { at: { path: [0, 0], offset: 2 } }));
  const rich = view.getMarkdown();
  await act(async () => view.toggleSource());
  await act(async () => source.edit("源码修改"));
  expect(state.editor).toBe(editor);
  expect(view.getMarkdown()).toBe("源码修改");
  await act(async () => source.undo());
  expect(view.getMarkdown()).toBe(rich);
  await act(async () => source.redo());
  expect(view.getMarkdown()).toBe("源码修改");
  await act(async () => view.toggleSource());
  expect(state.editor).toBe(editor);
  expect(editor.children[0]).toMatchObject({ children: [{ text: "源码修改" }] });
});

it("源码模式停驻富文本效果，恢复时沿用未修改块实例", async () => {
  const { editor, source, view } = await mount("正文\n\n```js\nconst a = 1;\n```\n");
  const mounts = state.mounts,
    effects = state.effects;
  await act(async () => view.toggleSource());
  await act(async () => source.edit("修改正文\n\n```js\nconst a = 1;\n```\n"));
  expect(state.effects).toBe(effects);
  await act(async () => view.toggleSource());
  expect(state.editor).toBe(editor);
  expect(state.mounts).toBe(mounts);
  expect(state.effects).toBe(effects + 1);
  expect(editor.children[0]).toMatchObject({ children: [{ text: "修改正文" }] });
});

it("源码原生撤销输入也委托同一文档历史", async () => {
  const { source, view } = await mount("原文");
  await act(async () => view.toggleSource());
  await act(async () => source.edit("新正文"));
  const undo = new InputEvent("beforeinput", {
    inputType: "historyUndo",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => document.body.dispatchEvent(undo));
  expect(undo.defaultPrevented).toBe(true);
  expect(view.getMarkdown()).toBe("原文");
  expect(source.getValue()).toBe("原文");
  await act(async () =>
    document.body.dispatchEvent(
      new InputEvent("beforeinput", { inputType: "historyRedo", bubbles: true, cancelable: true })
    )
  );
  expect(view.getMarkdown()).toBe("新正文");
});

it.each(["载入外部版本", "保留我的版本"])("未保存冲突：%s仍由文件会话仲裁", async choice => {
  const { editor, view, host } = await mount("原文");
  await act(async () => Transforms.insertText(editor, "本地", { at: { path: [0, 0], offset: 2 } }));
  const local = view.getMarkdown();
  state.read.mockResolvedValue("外部版本");
  await act(async () => state.changed?.({}, { filePath: "/test/doc.md" }));
  expect(view.getMarkdown()).toBe(local);
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
  const button = [...host.querySelectorAll("button")].find(item => item.textContent === choice);
  if (!button) throw new Error("冲突操作未显示");
  await act(async () => button.click());
  expect(state.editor).toBe(editor);
  if (choice === "载入外部版本") {
    expect(view.getMarkdown()).toBe("外部版本");
    expect(state.write).not.toHaveBeenCalled();
  } else expect(state.write).toHaveBeenCalledWith("/test/doc.md", local);
});

it("关闭后的迟到文件读取不再访问已释放文档", async () => {
  await mount("原文");
  let finish!: (text: string) => void;
  state.read.mockReturnValue(
    new Promise<string>(resolve => {
      finish = resolve;
    })
  );
  const reading = state.changed?.({}, { filePath: "/test/doc.md" });
  await dispose?.();
  dispose = undefined;
  finish("迟到正文");
  await expect(reading).resolves.toBeUndefined();
  expect(state.write).not.toHaveBeenCalled();
});

it("StrictMode 重复挂载不销毁当前文档", async () => {
  const { editor, source, view } = await mount("原文", true);
  await act(async () => Transforms.insertText(editor, "编辑", { at: { path: [0, 0], offset: 2 } }));
  await act(async () => view.toggleSource());
  await act(async () => source.edit("源码"));
  await act(async () => view.flush());
  expect(view.getMarkdown()).toBe("源码");
  expect(state.write).toHaveBeenCalledWith("/test/doc.md", "源码");
});

it("外部读取逆序完成时只接收最新版本", async () => {
  const { view } = await mount("原文");
  let finish!: (value: string) => void;
  state.read
    .mockReturnValueOnce(
      new Promise<string>(resolve => {
        finish = resolve;
      })
    )
    .mockResolvedValueOnce("新版本");
  const older = state.changed?.({}, { filePath: "/test/doc.md" });
  await act(async () => state.changed?.({}, { filePath: "/test/doc.md" }));
  await act(async () => {
    finish("旧版本");
    await older;
  });
  expect(view.getMarkdown()).toBe("新版本");
});

it("读取期间已完成本地保存时，不再应用旧读取结果", async () => {
  const { editor, view, host } = await mount("原文");
  let finish!: (value: string) => void;
  state.read.mockReturnValueOnce(
    new Promise<string>(resolve => {
      finish = resolve;
    })
  );
  const reading = state.changed?.({}, { filePath: "/test/doc.md" });
  await act(async () => Transforms.insertText(editor, "本地", { at: { path: [0, 0], offset: 2 } }));
  const saved = view.getMarkdown();
  await act(async () => view.flush());
  await act(async () => {
    finish("旧的外部正文");
    await reading;
  });
  expect(view.getMarkdown()).toBe(saved);
  expect(state.write).toHaveBeenCalledWith("/test/doc.md", saved);
  expect(host.textContent).not.toContain("与你未保存的内容冲突");
});
