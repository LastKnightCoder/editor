// tabs 规范化行为的等价测试（原 plugins/__tests__/normalize.test.ts 的用例，装配换成 v2 行为分发）
// + tab-pane 回车跳出 / 退格删 Tab 的行为用例（真实 kit 挂载）
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createEditor, Descendant, Editor, Transforms } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { describe, expect, it } from "vitest";

import { Editor as EditorComponent, createEditorKit } from "@tau/editor";
import tabsExtension, { tabPaneExtension } from "..";
import type { EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { tabsBehaviors, tabPaneBehaviors } from "../behaviors";
import {
  createCircuitBreaker,
  withElementBehaviors,
} from "../../../../core/kit/extensionGuard";
import { consoleErrorReporter } from "@tau/editor";

const createNormalizedEditor = (): Editor =>
  withElementBehaviors(
    createEditor(),
    new Map([
      ["tabs", [{ extension: "tau.tabs", behaviors: tabsBehaviors }]],
      ["tab-pane", [{ extension: "tau.tab-pane", behaviors: tabPaneBehaviors }]],
    ]),
    createCircuitBreaker(() => consoleErrorReporter)
  );

describe("tabs normalize 行为", () => {
  it("占位 children 不应删除节点或抛出异常，也不应被洗成正式结构", () => {
    const editor = createNormalizedEditor();
    editor.children = [
      {
        type: "tabs",
        activeKey: "tab-1",
        children: [{ type: "formatted", text: "" }],
      },
    ] as unknown as Descendant[];

    expect(() => Editor.normalize(editor, { force: true })).not.toThrow();
    // 空壳形态保守不动（可能是跨版本写入的脏数据），等真实数据源
    const [node] = editor.children as unknown as [{ type: string; children: { type: string }[] }];
    expect(node.type).toBe("tabs");
    expect(node.children[0].type).toBe("formatted");
  });

  it("游离的普通块包装进单个 pane 并保留实时内容", () => {
    const editor = createNormalizedEditor();
    editor.children = [
      {
        type: "tabs",
        activeKey: "b",
        children: [{ type: "paragraph", children: [{ type: "formatted", text: "最新" }] }],
      },
    ] as unknown as Descendant[];

    expect(() => Editor.normalize(editor, { force: true })).not.toThrow();
    const [node] = editor.children as unknown as [
      {
        type: string;
        activeKey: string;
        tabsContent?: unknown;
        children: { type: string; tabKey: string; title: string; children: unknown[] }[];
      },
    ];
    expect(node.type).toBe("tabs");
    expect(node.tabsContent).toBeUndefined();
    expect(node.children).toHaveLength(1);
    expect(node.activeKey).toBe(node.children[0].tabKey);
    expect(node.children[0]).toMatchObject({ type: "tab-pane", title: "Tab 1" });
    expect(JSON.stringify(node.children[0].children)).toContain("最新");
  });

  it("空 tabs 节点应退化为空段落", () => {
    const editor = createNormalizedEditor();
    editor.children = [
      {
        type: "tabs",
        activeKey: "a",
        children: [],
      },
    ] as unknown as Descendant[];

    Editor.normalize(editor, { force: true });
    expect(editor.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("失效 activeKey 应修正为第一个 pane", () => {
    const editor = createNormalizedEditor();
    editor.children = [
      {
        type: "tabs",
        activeKey: "gone",
        children: [
          {
            type: "tab-pane",
            tabKey: "a",
            title: "A",
            children: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
          },
          {
            type: "tab-pane",
            tabKey: "b",
            title: "B",
            children: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
          },
        ],
      },
    ] as unknown as Descendant[];

    Editor.normalize(editor, { force: true });
    const [node] = editor.children as unknown as [{ activeKey: string }];
    expect(node.activeKey).toBe("a");
  });
});

describe("tab-pane 行为（回车跳出 / 退格删 Tab）", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({
      extensions: [tabsExtension, tabPaneExtension],
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <EditorComponent ref={ref} kit={kit} readonly={false} initValue={initValue} />
        </DndProvider>
      );
    });
    return {
      editor: ref.current!.getEditor(),
      done: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  };

  const pane = (title: string, children: Descendant[]) =>
    ({ type: "tab-pane", tabKey: `key-${title}`, title, children }) as never;
  const paragraph = (value: string) => ({
    type: "paragraph" as const,
    children: [{ type: "formatted" as const, text: value }],
  });

  it("pane 最后一个空段落回车：删该段并在 tabs 后补空段落", async () => {
    const { editor, done } = await mount([
      {
        type: "tabs",
        activeKey: "key-A",
        children: [pane("A", [paragraph("x"), paragraph("")])],
      } as never,
    ]);
    Transforms.select(editor, Editor.end(editor, [0, 0, 1]));
    await act(async () => editor.insertBreak());
    const paneNode = (editor.children[0] as { children: unknown[] }).children[0] as {
      children: unknown[];
    };
    expect(paneNode.children).toHaveLength(1);
    expect(editor.children).toHaveLength(2);
    expect(editor.children[1]).toMatchObject({ type: "paragraph" });
    await done();
  });

  it("pane 仅剩一个空段落时退格：删除整个 Tab，tabs 退化为空段落", async () => {
    const { editor, done } = await mount([
      {
        type: "tabs",
        activeKey: "key-A",
        children: [pane("A", [paragraph("")])],
      } as never,
    ]);
    Transforms.select(editor, Editor.start(editor, [0, 0, 0]));
    await act(async () => editor.deleteBackward("character"));
    expect(editor.children).toHaveLength(1);
    expect(editor.children[0]).toMatchObject({ type: "paragraph" });
    await done();
  });
});
