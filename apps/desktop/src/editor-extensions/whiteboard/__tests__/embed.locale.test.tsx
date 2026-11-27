import { act, createRef } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import type { Whiteboard, WhiteboardContent } from "@/types";
import whiteboardExtension from "..";
import SelectWhiteboardContentModal from "../components/SelectWhiteboardContentModal";
import type DesktopWhiteboard from "@/features/shared/whiteboard/DesktopWhiteboard";

const io = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), list: vi.fn(), renders: vi.fn() }));
vi.mock("@/commands", () => ({
  getWhiteboardContentById: io.read,
  updateSubWhiteboard: io.update,
}));
vi.mock("@/commands/white-board", () => ({
  getAllWhiteboards: io.list,
  deleteWhiteboardContent: vi.fn(),
  incrementWhiteboardContentRefCount: vi.fn(),
}));
// The embedded canvas is a connector boundary; editor, host embed state, and selector remain real.
vi.mock("@/features/shared/whiteboard/DesktopWhiteboard", () => ({
  default: (props: ComponentProps<typeof DesktopWhiteboard>) => {
    io.renders(props);
    return <div data-embedded-canvas />;
  },
}));
vi.mock("@/features/shared/whiteboard/DesktopPageSchematic", () => ({
  DesktopPageSchematic: () => null,
}));
vi.mock("@/components/LocalImage", () => ({ default: () => null }));

const page: WhiteboardContent = {
  id: 15,
  name: "用户白板页 原名",
  imgUrl: "",
  createTime: 1,
  updateTime: 2,
  data: {
    children: [],
    viewPort: { minX: 11, minY: 23, width: 800, height: 600, zoom: 1.25 },
    selection: { selectedElements: [], selectArea: null },
    version: 2,
  },
};
const board: Whiteboard = {
  id: 5,
  title: "用户引用 白板",
  description: "原始描述",
  tags: ["原标签"],
  whiteboardContentIds: [page.id],
  whiteboardContentList: [page],
  activeWhiteboardContentId: page.id,
  snapshot: "",
  createTime: 1,
  updateTime: 2,
};

it("嵌入白板换语保留同一编辑器与画布载体，不重新读取或写回视口", async () => {
  const locale = desktopLocaleSource.getSnapshot();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container),
    ref = createRef<EditorRef>();
  const kit = createEditorKit({ extensions: [whiteboardExtension] });
  io.read.mockResolvedValue(page);
  io.read.mockClear();
  io.update.mockClear();
  io.renders.mockClear();
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={desktopI18n}>
          <DndProvider backend={HTML5Backend}>
            <Editor
              ref={ref}
              kit={kit}
              initValue={[
                {
                  type: "whiteboard",
                  id: "embed-original",
                  height: 400,
                  whiteboardContentId: 15,
                  children: [{ type: "formatted", text: "" }],
                },
              ]}
            />
          </DndProvider>
        </I18nRuntimeProvider>
      )
    );
    const editor = ref.current?.getEditor(),
      canvas = container.querySelector("[data-embedded-canvas]");
    if (!editor || !canvas) throw new Error("Embedded canvas unavailable");
    const nodes = editor.children,
      props = io.renders.mock.calls.at(-1)?.[0];
    expect(props.initData).toBe(page.data.children);
    expect(props.initViewPort).toBe(page.data.viewPort);
    const renderCount = io.renders.mock.calls.length;
    for (const language of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(language));
      expect(ref.current?.getEditor()).toBe(editor);
      expect(editor.children).toBe(nodes);
      expect(container.querySelector("[data-embedded-canvas]")).toBe(canvas);
      expect(io.renders).toHaveBeenCalledTimes(renderCount);
      expect(io.read).toHaveBeenCalledExactlyOnceWith(15);
      expect(io.update).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    desktopLocaleSource.setLocale(locale);
  }
});

it("引用白板筛选和进行中确认跨语不重取、不重置，原页面数据只提交一次", async () => {
  const locale = desktopLocaleSource.getSnapshot();
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let finish: (() => void) | undefined;
  const confirm = vi.fn<(content: WhiteboardContent, board: Whiteboard) => Promise<void>>(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  io.list.mockResolvedValue([board]);
  io.list.mockClear();
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={desktopI18n}>
          <SelectWhiteboardContentModal open onCancel={vi.fn()} onOk={confirm} />
        </I18nRuntimeProvider>
      )
    );
    const input = document.querySelector("input");
    if (!input) throw new Error("Whiteboard filter unavailable");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "用户引用"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.setSelectionRange(1, 3);
    });
    const candidate = [...document.querySelectorAll("button")].find(button =>
      button.textContent?.includes(board.title)
    );
    if (!candidate) throw new Error("Original whiteboard candidate unavailable");
    for (const language of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(language));
      expect(document.querySelector("input")).toBe(input);
      expect(input.value).toBe("用户引用");
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
      expect(candidate.isConnected).toBe(true);
      expect(io.list).toHaveBeenCalledTimes(1);
      expect(confirm).not.toHaveBeenCalled();
    }
    await act(async () => candidate.click());
    for (const language of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(language));
      expect(document.querySelector("input")).toBe(input);
      expect(io.list).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledExactlyOnceWith(page, board);
      expect(confirm.mock.calls[0][0].data).toBe(page.data);
    }
    await act(async () => finish?.());
    expect(confirm).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    desktopLocaleSource.setLocale(locale);
    if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", scroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});
