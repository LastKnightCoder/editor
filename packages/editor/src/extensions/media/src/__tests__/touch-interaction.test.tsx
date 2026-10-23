import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Path, Range, type Descendant } from "slate";
import { afterEach, describe, expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef, type ServiceRegistration } from "@tau/editor";
import { IEditorInteraction } from "@tau/editor/api";
import { IFileService, IResourceService } from "@tau/shared/host-services";
import webviewExtension from "../../../webview/src";
import { audio, image, inlineImage, mediaUiExtension, video } from "../index";
import { IEditorSlots } from "../../services";
import { createDefaultEditorSlots } from "../../slots";
import { useImageLightboxStore } from "../stores";

const paragraph = (text = ""): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  useImageLightboxStore.getState().close();
});

async function mount(value: Descendant[], options: { touch: boolean; readonly?: boolean }) {
  const kit = createEditorKit({
    extensions: [image, inlineImage, video, audio, webviewExtension, mediaUiExtension],
    services: [
      register => register(IResourceService, { upload: async () => "uploaded" }),
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register =>
        register(IFileService, {
          select: async () => null,
          readText: async () => "",
          getBaseName: path => path,
          getHomeDir: async () => "",
        }),
      ...(options.touch
        ? [(register => register(IEditorInteraction, { touch: true })) as ServiceRegistration]
        : []),
    ],
  });
  const ref = createRef<EditorRef>();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (readonly: boolean) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={readonly} initValue={value} />
        </DndProvider>
      )
    );
  await render(options.readonly ?? false);
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  cleanups.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return { editor, host, render };
}

const imageValue = (): Descendant[] => [
  { type: "image", url: "a.png", children: [{ type: "formatted", text: "" }] },
  paragraph("正文"),
];

const clickFrame = async (host: HTMLElement) => {
  const frame = host.querySelector("img")?.parentElement as HTMLElement;
  await act(async () => frame.click());
};

const handleCount = (host: HTMLElement) =>
  host.querySelectorAll('[style*="nwse-resize"], [style*="ew-resize"]').length;

it("触屏编辑态单击图片把选区放进图片，不出属性条与缩放手柄", async () => {
  const view = await mount(imageValue(), { touch: true });
  await clickFrame(view.host);
  const selection = view.editor.selection;
  expect(selection && Range.isCollapsed(selection)).toBe(true);
  expect(selection && Path.isAncestor([0], selection.anchor.path)).toBe(true);
  expect(handleCount(view.host)).toBe(0);
  // 选中后出现说明占位（宿主「说明」按钮编辑它）
  expect(view.host.querySelector("[data-media-caption]")).toBeTruthy();
});

it("桌面交互不受影响：单击图片显示缩放手柄", async () => {
  const view = await mount(imageValue(), { touch: false });
  await clickFrame(view.host);
  expect(handleCount(view.host)).toBeGreaterThan(0);
});

it("触屏阅读态单击图片打开查看器", async () => {
  const view = await mount(imageValue(), { touch: true, readonly: true });
  await clickFrame(view.host);
  const state = useImageLightboxStore.getState();
  expect(state.editor).toBe(view.editor);
  expect(state.items).toHaveLength(1);
});

it("触屏下音频标题不渲染输入框，单击卡片选中；只读末块不显示添加段落", async () => {
  const value: Descendant[] = [
    {
      type: "audio",
      src: "a.mp3",
      title: "周会",
      children: [{ type: "formatted", text: "" }],
    },
  ];
  const view = await mount(value, { touch: true });
  expect(view.host.querySelector('input[placeholder="音频标题…"]')).toBeNull();
  const card = view.host.querySelector("audio")?.parentElement as HTMLElement;
  await act(async () => card.click());
  const selection = view.editor.selection;
  expect(selection && Path.isAncestor([0], selection.anchor.path)).toBe(true);

  const addParagraph = () => view.host.querySelectorAll(".h-\\(--block-distance\\)").length;
  expect(addParagraph()).toBe(1);
  await view.render(true);
  expect(addParagraph()).toBe(0);
});

it("网页视图：触屏盖交互遮罩、不渲染高度拖拽；桌面只读也不渲染高度拖拽", async () => {
  const value: Descendant[] = [
    {
      type: "webview",
      url: "https://example.com",
      height: 400,
      children: [{ type: "formatted", text: "" }],
    } as Descendant,
    paragraph(),
  ];
  const touchView = await mount(value, { touch: true });
  expect(touchView.host.textContent).toContain("点按与网页交互");
  expect(touchView.host.querySelector(".cursor-ns-resize")).toBeNull();
  const button = [...touchView.host.querySelectorAll("button")].find(item =>
    item.textContent?.includes("点按与网页交互")
  )!;
  await act(async () => button.click());
  expect(touchView.host.textContent).not.toContain("点按与网页交互");

  const desktopView = await mount(value, { touch: false, readonly: true });
  expect(desktopView.host.querySelector(".cursor-ns-resize")).toBeNull();
  await desktopView.render(false);
  expect(desktopView.host.querySelector(".cursor-ns-resize")).toBeTruthy();
});

describe("触屏灯箱手势", () => {
  const twoImages = (): Descendant[] => [
    { type: "image", url: "a.png", children: [{ type: "formatted", text: "" }] },
    { type: "image", url: "b.png", children: [{ type: "formatted", text: "" }] },
  ];

  const pointer = (target: Element, type: string, x: number, y: number, id = 1) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: id });
    target.dispatchEvent(event);
  };

  const drag = async (target: Element, points: Array<[number, number]>) => {
    await act(async () => {
      pointer(target, "pointerdown", ...points[0]);
      for (const point of points.slice(1)) pointer(target, "pointermove", ...point);
      pointer(target, "pointerup", ...points[points.length - 1]);
    });
  };

  const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 260)));

  async function openLightbox() {
    HTMLElement.prototype.setPointerCapture ??= () => undefined;
    const view = await mount(twoImages(), { touch: true, readonly: true });
    await clickFrame(view.host);
    const stage = document.querySelector("[data-lightbox-stage]");
    if (!stage) throw new Error("未渲染触屏灯箱");
    return { view, stage };
  }

  it("左滑切到下一张，下滑关闭", async () => {
    const { stage } = await openLightbox();
    expect(useImageLightboxStore.getState().index).toBe(0);
    await drag(stage, [
      [200, 300],
      [150, 302],
      [60, 305],
    ]);
    await settle();
    expect(useImageLightboxStore.getState().index).toBe(1);

    await drag(stage, [
      [200, 100],
      [201, 140],
      [202, 300],
    ]);
    expect(useImageLightboxStore.getState().editor).toBeNull();
  });

  it("双击放大到 2×，再双击还原", async () => {
    const { stage } = await openLightbox();
    const scaleOf = () =>
      (document.querySelector("[data-touch-lightbox] img") as HTMLImageElement | null)?.style
        .transform ?? "";
    const tap = () => drag(stage, [[100, 100]]);
    await tap();
    await tap();
    expect(scaleOf()).toContain("scale(2)");
    await settle();
    await tap();
    await tap();
    expect(scaleOf()).toContain("scale(1)");
  });
});
