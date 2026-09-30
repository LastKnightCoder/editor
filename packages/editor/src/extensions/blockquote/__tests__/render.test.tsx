// 引用块渲染：大引号只画在最外层，嵌套内层只保留竖线
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { describe, expect, it } from "vitest";

import { Editor as EditorComponent, createEditorKit } from "../../../index";
import type { EditorRef } from "../../../types/editor";
import { createDefaultEditorSlots, IEditorSlots } from "../../../services";

const paragraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const quote = (...children: object[]) => ({ type: "blockquote", children });

const mount = async (initValue: Descendant[]) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
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
    container,
    done: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

const quoteMarks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("span[aria-hidden]")).filter(
    node => node.textContent === "“"
  );

describe("引用块渲染", () => {
  it("三层嵌套只在最外层画大引号", async () => {
    const value = [
      quote(paragraph("外层"), quote(paragraph("中层"), quote(paragraph("内层")))),
    ] as unknown as Descendant[];
    const { container, done } = await mount(value);

    const marks = quoteMarks(container);
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute("contenteditable")).toBe("false");
    await done();
  });

  it("并列的两个引用各自画大引号", async () => {
    const value = [
      quote(paragraph("甲")),
      paragraph("正文"),
      quote(paragraph("乙")),
    ] as unknown as Descendant[];
    const { container, done } = await mount(value);

    expect(quoteMarks(container)).toHaveLength(2);
    await done();
  });
});
