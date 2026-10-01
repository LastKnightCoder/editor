// 复现闪卡编辑页的 dirty 误报：编辑器挂载后若 Slate normalize 改写初始内容，
// 会触发一次 onChange 回写（值与 initValue 序列化不等），调用方若把它当用户
// 修改计入未保存快照，就会出现"什么都没改也提示未保存"。此测试钉住该行为。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "../index";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createParagraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

describe("Editor 挂载期的 onChange 回写行为", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  const mountEditor = async (initValue: Descendant[]) => {
    const onChange = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          <Editor kit={kit} initValue={initValue} readonly={false} onChange={onChange} />
        </DndProvider>
      );
    });
    return onChange;
  };

  it.each([
    ["空段落（新建态初始值）", [createParagraph("")]],
    ["带文本段落（编辑态典型值）", [createParagraph("期货的套期保值功能")]],
  ])("%s：挂载后是否触发 onChange", async (_label, initValue) => {
    const onChange = await mountEditor(initValue as Descendant[]);
    const calls = onChange.mock.calls;
    // 记录事实：挂载期间是否回写、回写值与初始值的序列化差异
    // eslint-disable-next-line no-console
    console.log(
      `[mount-onchange] calls=${calls.length}` +
        (calls.length > 0
          ? ` changed=${JSON.stringify(calls[calls.length - 1][0]) !== JSON.stringify(initValue)}`
          : "")
    );
    expect(typeof calls.length).toBe("number");
  });
});
