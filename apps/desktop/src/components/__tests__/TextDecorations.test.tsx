import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant } from "slate";
import {
  Editor,
  createEditorKit,
  defineElement,
  defineExtension,
  type EditorRef,
} from "@tau/editor";
import type { PluginContext, PluginDecorationBlock, PluginTextDecoration } from "@tau/plugins";
import { expect, it, vi } from "vitest";
import { DesktopTextDecorations } from "@/app/plugins/text-decorations";
import {
  DecorationViewContext,
  textDecorationExtension,
  useTextDecorations,
} from "../ContentEditor/TextDecorationExtension";

it("跨格式结果只匹配一次，修改正文后拒绝迟到的旧装饰", async () => {
  vi.useFakeTimers();
  const registry = new DesktopTextDecorations({
    rowState: () => "once",
    subscribe: () => () => {},
  });
  const source = { kind: "article" as const, id: "7" };
  const nodes: Descendant[] = [
    {
      type: "paragraph",
      children: [
        { type: "formatted", text: "间隔" },
        { type: "formatted", text: "重复", bold: true },
      ],
    },
  ];
  const kit = createEditorKit({ extensions: [textDecorationExtension] });
  const ref = createRef<EditorRef>();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const result: PluginTextDecoration[] = [
    { start: 0, end: 4, appearance: "reference", key: "term" },
  ];
  let release: (() => void) | undefined;
  let pendingSignal: AbortSignal | undefined;
  let delayNext = false;
  const getDecorations = vi.fn(async ({ text }: PluginDecorationBlock, signal: AbortSignal) => {
    if (delayNext) {
      delayNext = false;
      pendingSignal = signal;
      await new Promise<void>(resolve => {
        release = resolve;
      });
    }
    return text === "间隔重复" ? result : [];
  });
  const controller = new AbortController();
  const registration = registry.register(
    { pluginId: "test", signal: controller.signal } as PluginContext,
    {
      sources: ["article"],
      getDecorations,
      onActivate: () => {},
    },
    { name: "测试" }
  );
  function Surface() {
    const { view, decorate, renderTopLevelBlock } = useTextDecorations(registry, source);
    return (
      <DecorationViewContext.Provider value={view}>
        <Editor
          ref={ref}
          initValue={nodes}
          kit={kit}
          readonly={false}
          decorate={decorate}
          renderTopLevelBlock={renderTopLevelBlock}
        />
      </DecorationViewContext.Provider>
    );
  }
  const markedText = () =>
    [...host.querySelectorAll('[role="link"]')].map(node => node.textContent).join("");
  const settle = () =>
    act(async () => {
      await vi.runAllTimersAsync();
    });
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Surface />
        </DndProvider>
      )
    );
    await settle();
    expect(markedText()).toBe("间隔重复");
    const editor = ref.current!.getEditor();
    expect(editor.children).toEqual(nodes);
    await act(async () => Transforms.select(editor, { path: [0, 0], offset: 0 }));
    await settle();
    expect(getDecorations).toHaveBeenCalledTimes(1);
    delayNext = true;
    await act(async () => registration.invalidate());
    await settle();
    expect(markedText()).toBe("");
    await act(async () => Transforms.insertText(editor, "新"));
    await settle();
    expect(pendingSignal?.aborted).toBe(true);
    expect(getDecorations.mock.lastCall?.[0].text).toBe("新间隔重复");
    await act(async () => release?.());
    await settle();
    expect(markedText()).toBe("");
  } finally {
    await act(async () => root.unmount());
    controller.abort();
    host.remove();
    vi.useRealTimers();
  }
});

// 代码块按需加载时没有 DOM；文字装饰不能因此让卡片打开失败。
it("独立内容块尚未挂载 DOM 时仍能打开正文且保留数据", async () => {
  const registry = new DesktopTextDecorations({
    rowState: () => "once",
    subscribe: () => () => {},
  });
  const controller = new AbortController();
  registry.register(
    { pluginId: "test", signal: controller.signal } as PluginContext,
    { sources: ["card"], getDecorations: async () => [], onActivate: () => {} },
    { name: "测试" }
  );
  const nodes: Descendant[] = [
    {
      type: "code-block",
      language: "markdown",
      uuid: "loading-code",
      children: [
        { type: "code-step", code: "# 保留源码", children: [{ type: "formatted", text: "" }] },
      ],
    },
  ];
  const kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.loading-code",
        elements: [
          defineElement({
            type: "code-block",
            kind: "block",
            isVoid: true,
            render: () => null,
          }),
        ],
      }),
    ],
  });
  const ref = createRef<EditorRef>();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const source = { kind: "card" as const, id: "loading-card" };
  function Surface() {
    const { view, decorate, renderTopLevelBlock } = useTextDecorations(registry, source);
    return (
      <DecorationViewContext.Provider value={view}>
        <Editor
          ref={ref}
          initValue={nodes}
          kit={kit}
          readonly
          decorate={decorate}
          renderTopLevelBlock={renderTopLevelBlock}
        />
      </DecorationViewContext.Provider>
    );
  }
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Surface />
        </DndProvider>
      )
    );
    expect(ref.current?.getEditor().children).toEqual(nodes);
  } finally {
    await act(async () => root.unmount());
    controller.abort();
    host.remove();
  }
});
