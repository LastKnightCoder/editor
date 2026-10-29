import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EditorRef } from "@tau/editor";
import { createEditor, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";
import { useContentLocation } from "../useContentLocation";

function Probe(props: Parameters<typeof useContentLocation>[0]) {
  useContentLocation(props);
  return null;
}

let host: HTMLElement;
let container: HTMLElement;
let editable: HTMLElement;
let target: HTMLElement;
let root: Root;
let editor: ReturnType<typeof createEditor>;
let editorRef: RefObject<EditorRef | null>;
let scroll: ReturnType<typeof vi.fn>;
let unavailable: ReturnType<typeof vi.fn>;
let toDOMNode: MockInstance<typeof ReactEditor.toDOMNode>;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"],
  });
  host = document.createElement("div");
  container = document.createElement("div");
  editable = document.createElement("div");
  target = document.createElement("div");
  editable.append(target);
  container.append(editable);
  document.body.append(host, container);
  root = createRoot(host);
  editor = createEditor();
  editor.children = [
    {
      type: "check-list",
      children: [
        {
          type: "check-list-item",
          taskId: "parent",
          children: [
            { type: "paragraph", children: [{ text: "父任务" }] },
            {
              type: "check-list",
              children: [
                {
                  type: "check-list-item",
                  taskId: "nested",
                  checked: false,
                  children: [{ type: "paragraph", children: [{ text: "嵌套任务" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ] as unknown as Descendant[];
  editorRef = {
    current: {
      getEditor: () => editor,
      getEditableElement: () => editable,
      focus: vi.fn(),
      deselect: vi.fn(),
      isFocus: () => false,
    },
  };
  scroll = vi.fn();
  unavailable = vi.fn();
  target.scrollIntoView = scroll;
  toDOMNode = vi.spyOn(ReactEditor, "toDOMNode").mockReturnValue(target);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function render(
  options: {
    taskId?: string;
    block?: number;
    requestId?: string;
    ready?: boolean;
    active?: boolean;
  } = {}
) {
  act(() =>
    root.render(
      <Probe
        editorRef={editorRef}
        container={container}
        contentId={1}
        taskId="nested"
        ready
        active
        onUnavailable={unavailable}
        {...options}
      />
    )
  );
}

function nextFrame() {
  act(() => vi.advanceTimersToNextFrame());
}

it("定位嵌套原待办，不更改文档、选区和焦点", () => {
  const before = JSON.stringify(editor.children);
  render();
  nextFrame();
  expect(toDOMNode).toHaveBeenCalledWith(
    editor,
    expect.objectContaining({ taskId: "nested", checked: false })
  );
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "center", behavior: "instant" });
  expect(editor.selection).toBeNull();
  expect(editor.operations).toEqual([]);
  expect(JSON.stringify(editor.children)).toBe(before);
  expect(editorRef.current?.focus).not.toHaveBeenCalled();
  expect(unavailable).not.toHaveBeenCalled();
});

it("协作文档未就绪时等待，DOM 映射建立后重试", async () => {
  render({ ready: false });
  nextFrame();
  expect(toDOMNode).not.toHaveBeenCalled();
  toDOMNode.mockImplementationOnce(() => {
    throw new Error("DOM 尚未挂载");
  });
  render();
  nextFrame();
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => {
    editable.append(document.createElement("span"));
    await Promise.resolve();
  });
  nextFrame();
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("页面隐藏取消待执行定位，恢复后定位一次且不反复拉回视口", () => {
  render();
  render({ active: false });
  nextFrame();
  expect(scroll).not.toHaveBeenCalled();
  render();
  nextFrame();
  expect(scroll).toHaveBeenCalledTimes(1);
  render({ active: false });
  render();
  nextFrame();
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("切换目标时取消旧请求；目标不存在时不滚动到其他节点", () => {
  render();
  render({ taskId: "missing" });
  nextFrame();
  expect(scroll).not.toHaveBeenCalled();
  expect(toDOMNode).not.toHaveBeenCalled();
  expect(unavailable).toHaveBeenCalledExactlyOnceWith("待办已不存在或已发生变化，请在原文中查看");
  render({ taskId: "parent" });
  nextFrame();
  expect(toDOMNode).toHaveBeenCalledWith(editor, expect.objectContaining({ taskId: "parent" }));
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("正文 DOM 外的节点不滚动，卸载后不再响应迟到变化", async () => {
  const outside = document.createElement("div");
  const outsideScroll = vi.fn();
  outside.scrollIntoView = outsideScroll;
  toDOMNode.mockReturnValue(outside);
  render();
  nextFrame();
  expect(outsideScroll).not.toHaveBeenCalled();
  act(() => root.render(null));
  toDOMNode.mockReturnValue(target);
  await act(async () => {
    editable.append(document.createElement("span"));
    await Promise.resolve();
  });
  nextFrame();
  expect(scroll).not.toHaveBeenCalled();
});

it("不可见待办提示展开，不通过修改正文折叠状态强行定位", () => {
  const before = JSON.stringify(editor.children);
  editable.style.display = "none";
  render();
  nextFrame();
  expect(unavailable).toHaveBeenCalledExactlyOnceWith("待办位于折叠内容中，请展开后查看");
  expect(scroll).not.toHaveBeenCalled();
  expect(editor.operations).toEqual([]);
  expect(JSON.stringify(editor.children)).toBe(before);
});

it("DOM 未就绪的等待有界，协作未就绪时不提前报错", () => {
  render({ ready: false });
  act(() => vi.advanceTimersByTime(5000));
  expect(unavailable).not.toHaveBeenCalled();
  toDOMNode.mockImplementation(() => {
    throw new Error("DOM 不可用");
  });
  render();
  act(() => vi.advanceTimersByTime(3000));
  expect(unavailable).toHaveBeenCalledExactlyOnceWith("待办定位暂不可用，请在原文中查看");
  expect(scroll).not.toHaveBeenCalled();
});

it("按顶层块序号定位，不变更正文或唤起键盘", () => {
  editor.children.push({ type: "paragraph", children: [{ type: "formatted", text: "第二块" }] });
  const before = JSON.stringify(editor.children);
  render({ taskId: undefined, block: 1, requestId: "open-1" });
  nextFrame();
  expect(toDOMNode).toHaveBeenCalledWith(editor, editor.children[1]);
  expect(scroll).toHaveBeenCalledOnce();
  expect(JSON.stringify(editor.children)).toBe(before);
  expect(editor.operations).toEqual([]);
  expect(editorRef.current?.focus).not.toHaveBeenCalled();
});
it.each([999, -1, 0.5])("块序号 %s 越界或无效时回到文首", block => {
  render({ taskId: undefined, block });
  nextFrame();
  expect(toDOMNode).toHaveBeenCalledWith(editor, editor.children[0]);
});
it("同一块的新打开请求重新定位，普通重渲染不抢滚动", () => {
  render({ taskId: undefined, block: 0, requestId: "first" });
  nextFrame();
  render({ taskId: undefined, block: 0, requestId: "first" });
  nextFrame();
  expect(scroll).toHaveBeenCalledTimes(1);
  render({ taskId: undefined, block: 0, requestId: "second" });
  nextFrame();
  expect(scroll).toHaveBeenCalledTimes(2);
});
it("块定位等待正文就绪，隐藏时取消，恢复时执行当前请求", () => {
  render({ taskId: undefined, block: 0, ready: false });
  nextFrame();
  expect(scroll).not.toHaveBeenCalled();
  render({ taskId: undefined, block: 0 });
  render({ taskId: undefined, block: 0, active: false });
  nextFrame();
  expect(scroll).not.toHaveBeenCalled();
  render({ taskId: undefined, block: 0 });
  nextFrame();
  expect(scroll).toHaveBeenCalledOnce();
});
