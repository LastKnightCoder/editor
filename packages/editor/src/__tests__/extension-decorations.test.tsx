// 扩展的暂态装饰：与宿主 decorate 合并，属性只到叶子不进文档；单个扩展出错隔离并熔断
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Text, type Descendant, type Range } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "../index";
import { defineExtension, type MarkRenderProps } from "../api";
import type { EditorRef } from "../types/editor";
import { IExtensionErrorReporter, type ExtensionErrorEvent } from "../services";
import { CIRCUIT_BREAKER_THRESHOLD } from "../kit/extensionGuard";

const roots: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

const value: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "整理 #发布 文档" }] } as never,
];

/** 文字里每个 #词 装饰为 tag */
const tagRanges = (node: unknown, path: number[]): Range[] => {
  if (!Text.isText(node)) return [];
  const ranges: Range[] = [];
  for (const match of node.text.matchAll(/#\S+/g)) {
    ranges.push({
      anchor: { path, offset: match.index! },
      focus: { path, offset: match.index! + match[0].length },
      tag: match[0],
    } as Range);
  }
  return ranges;
};

const TagMark = ({ leaf, children }: MarkRenderProps) => (
  <span data-tag={(leaf as unknown as { tag: string }).tag}>{children}</span>
);

const tagExtension = defineExtension({
  id: "test.tags",
  marks: [{ id: "test.tags.mark", keys: ["tag"], render: TagMark }],
  decorations: [{ id: "test.tags", decorate: (_editor, [node, path]) => tagRanges(node, path) }],
});

const mount = async (
  extensions: Parameters<typeof createEditorKit>[0]["extensions"],
  props: { decorate?: (entry: never) => Range[]; events?: ExtensionErrorEvent[] } = {}
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
    extensions,
    services: [
      register => register(IExtensionErrorReporter, { report: event => props.events?.push(event) }),
    ],
  });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} readonly={false} initValue={value} decorate={props.decorate} />
      </DndProvider>
    );
  });
  return { container, editor: ref.current!.getEditor() };
};

describe("扩展装饰", () => {
  it("装饰属性渲染到叶子，但不进入文档", async () => {
    const { container, editor } = await mount([tagExtension]);
    expect(container.querySelector('[data-tag="#发布"]')?.textContent).toBe("#发布");
    expect(JSON.stringify(editor.children)).not.toContain('"tag"');
  });

  it("与宿主 decorate 合并", async () => {
    const hostMark = defineExtension({
      id: "test.host-mark",
      marks: [
        {
          id: "test.host",
          keys: ["host"],
          render: ({ children }) => <span data-host>{children}</span>,
        },
      ],
    });
    const decorate = vi.fn(([node, path]: [unknown, number[]]) =>
      Text.isText(node)
        ? [{ anchor: { path, offset: 0 }, focus: { path, offset: 2 }, host: true } as Range]
        : []
    );
    const { container } = await mount([tagExtension, hostMark], { decorate: decorate as never });
    expect(container.querySelector("[data-host]")?.textContent).toBe("整理");
    expect(container.querySelector('[data-tag="#发布"]')).toBeTruthy();
  });

  it("装饰 id 重复时创建 kit 即报错", () => {
    const twin = defineExtension({
      id: "test.twin",
      decorations: [{ id: "test.tags", decorate: () => [] }],
    });
    expect(() => createEditorKit({ extensions: [tagExtension, twin] })).toThrow(/装饰声明/);
  });

  it("出错的扩展只丢自己的装饰，连续出错后熔断", async () => {
    const events: ExtensionErrorEvent[] = [];
    const broken = defineExtension({
      id: "test.broken",
      decorations: [
        {
          id: "test.broken",
          decorate: () => {
            throw new Error("boom");
          },
        },
      ],
    });
    const { container } = await mount([tagExtension, broken], { events });
    expect(container.querySelector('[data-tag="#发布"]')).toBeTruthy();
    const decorateEvents = events.filter(e => e.phase === "decorate");
    expect(decorateEvents.length).toBeGreaterThanOrEqual(1);
    expect(decorateEvents.every(e => e.extension === "test.broken")).toBe(true);
    // 熔断后不再调用：上报次数封顶在阈值
    expect(decorateEvents.length).toBeLessThanOrEqual(CIRCUIT_BREAKER_THRESHOLD);
    if (decorateEvents.length === CIRCUIT_BREAKER_THRESHOLD)
      expect(decorateEvents.at(-1)?.disabled).toBe(true);
  });
});
