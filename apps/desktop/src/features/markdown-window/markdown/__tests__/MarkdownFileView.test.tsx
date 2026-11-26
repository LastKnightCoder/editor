import { act, createRef, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Editor as SlateEditor } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MarkdownViewHandle } from "../../types";

const state = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn<(path: string, text: string) => Promise<void>>(async () => undefined),
  changed: undefined as
    | ((event: unknown, payload: { filePath: string }) => Promise<void>)
    | undefined,
  editor: undefined as SlateEditor | undefined,
  source: undefined as
    | {
        edit(text: string): void;
        undo(): void;
        redo(): void;
        getValue(): string;
        getCursor(): { line: number; ch: number };
      }
    | undefined,
  mounts: 0,
  effects: 0,
  sourceSetValues: 0,
  sourceMounts: 0,
}));
// jsdom 无 ResizeObserver（组件用它算大纲独立滚动的高度上限）
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {
      /* 测试桩 */
    }
    unobserve() {
      /* 测试桩 */
    }
    disconnect() {
      /* 测试桩 */
    }
  }
);
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);
vi.mock("@/commands/file", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/file")>()),
  getHomeDir: vi.fn(async () => "/test"),
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
  ContentOutline: () => null,
  extractContentHeaders: (
    nodes: { type: string; level?: number; children?: { text?: string }[] }[]
  ) =>
    nodes.flatMap((node, index) =>
      node.type === "header"
        ? [
            {
              id: `header-${index}`,
              level: node.level ?? 1,
              title: node.children?.map(child => child.text ?? "").join("") ?? "",
            },
          ]
        : []
    ),
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
            if (props.document) state.editor = value?.getEditor();
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
            state.sourceSetValues++;
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
          cursorCoords: vi.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
          scrollIntoView: vi.fn(),
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
        state.sourceMounts++;
        state.source = editor;
        latest.current.editorDidMount(editor);
      }, [editor]);
      return createElement("output", { "data-source": true }, text);
    },
  };
});

import { MarkdownFileView } from "../MarkdownFileView";
import { CodeMirrorView } from "../CodeMirrorView";

let dispose: (() => Promise<void>) | undefined;
beforeEach(() => {
  state.read.mockReset();
  state.write.mockClear();
  state.mounts = 0;
  state.effects = 0;
  state.sourceSetValues = 0;
  state.sourceMounts = 0;
  state.source = undefined;
  state.editor = undefined;
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

async function mount(text: string, strict = false, outlineColumn = false) {
  state.read.mockResolvedValue(text);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<MarkdownViewHandle>();
  const render = (column: boolean) => (
    <DndProvider backend={HTML5Backend}>
      <MarkdownFileView
        ref={ref}
        path="/test/doc.md"
        outlineColumn={column}
        onStatus={() => undefined}
        onOpenMarkdown={() => undefined}
        onSaveAs={() => undefined}
      />
    </DndProvider>
  );
  await act(async () =>
    root.render(strict ? <StrictMode>{render(outlineColumn)}</StrictMode> : render(outlineColumn))
  );
  dispose = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  if (!state.editor || !ref.current) throw new Error("文件编辑器未就绪");
  return {
    setOutlineColumn: (column: boolean) => root.render(render(column)),
    editor: state.editor,
    source: () => {
      if (!state.source) throw new Error("源码编辑器未挂载");
      return state.source;
    },
    view: ref.current,
    host,
  };
}

it.each([false, true])("拖选时更新选中字数不折回旧光标（长文：%s）", async long => {
  const { editor, view } = await mount("拖选这段正文" + (long ? "\n\n" + longText() : ""));
  if (long) await frames(3);
  const editable = ReactEditor.toDOMNode(editor, editor);
  const [text] = ReactEditor.toDOMPoint(editor, { path: [0, 0], offset: 0 });
  const selection = window.getSelection();
  if (!selection) throw new Error("缺少原生选区");
  await act(async () => {
    editable.focus();
    Transforms.select(editor, { path: [0, 0], offset: 0 });
  });
  await act(async () => {
    document.dispatchEvent(new Event("selectionchange"));
    await vi.advanceTimersByTimeAsync(1);
  });
  // Slate 节流同步期间，原生拖选已变化，状态栏先收到 selectionchange。
  await act(async () => {
    selection.setBaseAndExtent(text, 0, text, 3);
    document.dispatchEvent(new Event("selectionchange"));
  });
  expect(selection.toString()).toBe("拖选这");
  await act(async () => {
    selection.setBaseAndExtent(text, 5, text, 1);
    document.dispatchEvent(new Event("selectionchange"));
  });
  expect(selection.toString()).toBe("选这段正");
  expect(selection.anchorOffset).toBe(5);
  expect(selection.focusOffset).toBe(1);
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
});

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

it("保持图片导出弹窗打开时，预览随外部载入和正文编辑更新", async () => {
  const { editor, view } = await mount("原文");
  const preview = () => document.querySelector('[role="dialog"] [data-slate-editor]');
  await act(async () => view.openImageExport("文档"));
  expect(preview()?.textContent).toBe("原文");

  state.read.mockResolvedValue("外部更新");
  await act(async () => state.changed?.({}, { filePath: "/test/doc.md" }));
  expect(preview()?.textContent).toBe("外部更新");
  expect(state.write).not.toHaveBeenCalled();

  await act(async () => Transforms.insertText(editor, "正文", { at: { path: [0, 0], offset: 4 } }));
  expect(preview()?.textContent).toBe("外部更新正文");
  expect(state.editor).toBe(editor);
});

it("无法投影的原文自动进入源码，修复后继续保存且不丢原文", async () => {
  const raw =
    ':tau-node[]{type="formatted" json="{&quot;type&quot;:&quot;formatted&quot;,&quot;text&quot;:&quot;&quot;,&quot;vendor&quot;:true}"}';
  const { source, view, host } = await mount(raw);
  expect(host.textContent).toContain("原文已保留");
  expect(source().getValue()).toBe(raw);
  expect(host.querySelector('[aria-pressed="true"]')).not.toBeNull();
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
  await act(async () => source().edit("已修复正文"));
  await act(async () => view.flush());
  expect(host.textContent).not.toContain("原文已保留");
  expect(state.write).toHaveBeenCalledWith("/test/doc.md", "已修复正文");
  await act(async () => source().undo());
  expect(view.getMarkdown()).toBe(raw);
});

it("源码切换常驻同一编辑器，源码与富文本共用撤销", async () => {
  const { editor, source, view } = await mount("正文");
  await act(async () => Transforms.insertText(editor, "本地", { at: { path: [0, 0], offset: 2 } }));
  const rich = view.getMarkdown();
  await act(async () => view.toggleSource());
  await act(async () => source().edit("源码修改"));
  expect(state.editor).toBe(editor);
  expect(view.getMarkdown()).toBe("源码修改");
  await act(async () => source().undo());
  expect(view.getMarkdown()).toBe(rich);
  await act(async () => source().redo());
  expect(view.getMarkdown()).toBe("源码修改");
  await act(async () => view.toggleSource());
  expect(state.editor).toBe(editor);
  expect(editor.children[0]).toMatchObject({ children: [{ text: "源码修改" }] });
});

it("正文输入不重置隐藏的源码视图，进入源码后再同步最新正文", async () => {
  const { editor, source, view } = await mount("正文");
  const initialSets = state.sourceSetValues;
  expect(state.sourceMounts).toBe(0);
  await act(async () => Transforms.insertText(editor, "本地", { at: { path: [0, 0], offset: 2 } }));
  await act(async () => Transforms.insertText(editor, "更新", { at: { path: [0, 0], offset: 4 } }));
  expect(state.sourceSetValues).toBe(initialSets);
  const rich = view.getMarkdown();
  expect(rich).toContain("正文本地更新");
  await act(async () => view.toggleSource());
  expect(source().getValue()).toBe(rich);
  expect(state.sourceMounts).toBe(1);
  expect(state.sourceSetValues).toBe(initialSets);
  const firstSource = source();
  await act(async () => view.toggleSource());
  await act(async () => Transforms.insertText(editor, "再", { at: { path: [0, 0], offset: 0 } }));
  await act(async () => view.toggleSource());
  expect(source()).toBe(firstSource);
  expect(source().getValue()).toBe(view.getMarkdown());
  expect(state.sourceMounts).toBe(1);
  expect(state.sourceSetValues).toBe(initialSets + 1);
});

it("源码模式停驻富文本效果，恢复时沿用未修改块实例", async () => {
  const { editor, source, view } = await mount("正文\n\n```js\nconst a = 1;\n```\n");
  const mounts = state.mounts,
    effects = state.effects;
  await act(async () => view.toggleSource());
  await act(async () => source().edit("修改正文\n\n```js\nconst a = 1;\n```\n"));
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
  await act(async () => source().edit("新正文"));
  const undo = new InputEvent("beforeinput", {
    inputType: "historyUndo",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => document.body.dispatchEvent(undo));
  expect(undo.defaultPrevented).toBe(true);
  expect(view.getMarkdown()).toBe("原文");
  expect(source().getValue()).toBe("原文");
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
  await act(async () => source().edit("源码"));
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

it("源码首次延迟挂载仍双向恢复光标，首次进入不改写正文", async () => {
  const raw = "正文\n\n下一段";
  const { editor, source, view } = await mount(raw);
  expect(state.sourceMounts).toBe(0);
  await act(async () => Transforms.select(editor, { path: [1, 0], offset: 1 }));
  await act(async () => view.toggleSource());
  await act(async () => vi.advanceTimersByTimeAsync(160));
  expect(source().getCursor()).toEqual({ line: 2, ch: 1 });
  expect(view.getMarkdown()).toBe(raw);
  await act(async () => view.toggleSource());
  await act(async () => vi.advanceTimersByTimeAsync(160));
  expect(editor.selection?.focus).toEqual({ path: [1, 0], offset: 1 });
  expect(state.sourceMounts).toBe(1);
  expect(state.write).not.toHaveBeenCalled();
});

it("大纲列开合与源码标题变化保持同一正文和源码实例，撤销后显示同步", async () => {
  const raw = "# 标题\n\n正文\n\n```js\nconst x = 1;\n```\n";
  const { editor, source, view, setOutlineColumn } = await mount(raw, false, true);
  const mounts = state.mounts;
  await act(async () => view.toggleSource());
  await act(async () => vi.advanceTimersByTimeAsync(1200));
  const firstSource = source();
  expect(state.editor).toBe(editor);
  expect(state.sourceMounts).toBe(1);
  await act(async () => source().edit(raw.replace("# 标题\n\n", "")));
  await act(async () => vi.advanceTimersByTimeAsync(1200));
  await act(async () => source().undo());
  await act(async () => vi.advanceTimersByTimeAsync(1200));
  expect(source().getValue()).toBe(raw);
  await act(async () => setOutlineColumn(false));
  await act(async () => setOutlineColumn(true));
  expect(source()).toBe(firstSource);
  expect(state.sourceMounts).toBe(1);
  await act(async () => view.toggleSource());
  expect(state.editor).toBe(editor);
  expect(state.mounts).toBe(mounts);
  expect(view.getMarkdown()).toBe(raw);
});

it("源码实例注册回调更换后重新登记同一实例，卸载时注销", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    first = vi.fn(),
    second = vi.fn();
  const render = (onMount: typeof first) => (
    <CodeMirrorView
      value="正文"
      mode="markdown"
      scrollEl={null}
      onChange={() => undefined}
      onMount={onMount}
    />
  );
  dispose = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () => root.render(render(first)));
  const instance = first.mock.calls[0]?.[0];
  expect(instance).toBeDefined();
  await act(async () => root.render(render(second)));
  expect(first).toHaveBeenLastCalledWith(null);
  expect(second).toHaveBeenLastCalledWith(instance);
  await dispose();
  dispose = undefined;
  expect(second).toHaveBeenLastCalledWith(null);
});

const longText = () => Array.from({ length: 160 }, (_, index) => `正文${index}`).join("\n\n");

async function frames(count = 12) {
  for (let index = 0; index < count; index++)
    await act(async () => vi.advanceTimersByTimeAsync(32));
}

it("长文默认显示可编辑正文，保存与导出使用完整内容", async () => {
  const raw = longText();
  const { host, view } = await mount(raw);
  await frames(3);
  expect(
    host.querySelector('[data-markdown-full-editor="ready"] [contenteditable="true"]')
  ).not.toBeNull();
  expect(host.querySelectorAll('[data-markdown-viewport-block="spacer"]').length).toBeGreaterThan(
    0
  );
  expect(view.getContent()).toHaveLength(160);
  expect(view.getMarkdown()).toBe(raw);
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
  await dispose?.();
  dispose = undefined;
  await frames();
  expect(state.editor).toBeUndefined();
  expect(state.write).not.toHaveBeenCalled();
});

it("挂载长文不抢外部输入框焦点", async () => {
  const { host } = await mount(longText());
  const field = document.createElement("input");
  document.body.appendChild(field);
  field.focus();
  try {
    await frames();
    expect(host.querySelector('[data-markdown-full-editor="ready"]')).not.toBeNull();
    expect(document.activeElement).toBe(field);
    expect(state.write).not.toHaveBeenCalled();
  } finally {
    field.remove();
  }
});

it("首屏编辑的撤销、重做及保存保留完整正文", async () => {
  const raw = longText();
  const { view, editor } = await mount(raw);
  await frames(3);
  await act(async () => Transforms.insertText(editor, "新", { at: { path: [0, 0], offset: 0 } }));
  await act(async () => editor.undo());
  expect(view.getMarkdown()).toBe(raw);
  await act(async () => editor.redo());
  const edited = "新" + raw + "\n";
  expect(view.getMarkdown()).toBe(edited);
  await act(async () => view.flush());
  expect(state.write).toHaveBeenLastCalledWith("/test/doc.md", edited);
});

it.each([false, true])(
  "长文源码保存与历史仍用全文，返回不覆盖新焦点（外部 CodeMirror：%s）",
  async externalCodeMirror => {
    const raw = longText();
    const { host, view, source } = await mount(raw);
    await act(async () => view.toggleSource());
    const code = source();
    const next = raw.replace("正文0", "源码更新");
    await act(async () => code.edit(next));
    await act(async () => view.flush());
    expect(state.write).toHaveBeenLastCalledWith("/test/doc.md", next);
    await act(async () => code.undo());
    expect(view.getMarkdown()).toBe(raw);
    await act(async () => code.redo());
    expect(view.getMarkdown()).toBe(next);
    await act(async () => view.toggleSource());
    const field = document.createElement("input");
    const owner = document.createElement("div");
    if (externalCodeMirror) owner.className = "CodeMirror";
    owner.appendChild(field);
    document.body.appendChild(owner);
    field.focus();
    try {
      await frames(20);
      expect(host.querySelector('[data-markdown-full-editor="ready"]')).not.toBeNull();
      expect(document.activeElement).toBe(field);
      expect(state.editor?.children).toHaveLength(160);
      expect(view.getMarkdown()).toBe(next);
      expect(state.source).toBe(code);
      for (const [, saved] of state.write.mock.calls) expect(saved.split("\n\n")).toHaveLength(160);
    } finally {
      owner.remove();
    }
  }
);

it("视口挂载期间应用外部版本，不因屏外内容缺少 DOM 而丢失", async () => {
  const raw = longText();
  const { host, view, editor } = await mount(raw);
  const external = "外部新增\n\n" + raw;
  state.read.mockResolvedValue(external);
  await act(async () => state.changed?.({}, { filePath: "/test/doc.md" }));
  expect(view.getMarkdown()).toBe(external);
  expect(view.getContent()).toHaveLength(161);
  await frames();
  expect(host.querySelector('[data-markdown-full-editor="ready"]')).not.toBeNull();
  expect(editor.children).toHaveLength(161);
  expect(state.editor).toBe(editor);
  await act(async () => view.flush());
  expect(state.write).not.toHaveBeenCalled();
});

it("长文从源码返回后，富文本撤销重做继续使用同一文件历史", async () => {
  const raw = longText();
  const { view, editor, source } = await mount(raw);
  await act(async () => view.toggleSource());
  const next = raw.replace("正文0", "已编辑首段");
  await act(async () => source().edit(next));
  await act(async () => view.toggleSource());
  await frames();
  await act(async () => editor.undo());
  expect(view.getMarkdown()).toBe(raw);
  await act(async () => editor.redo());
  expect(view.getMarkdown()).toBe(next);
  expect(view.getContent()).toHaveLength(160);
  await act(async () => view.flush());
  expect(state.write).toHaveBeenLastCalledWith("/test/doc.md", next);
});
