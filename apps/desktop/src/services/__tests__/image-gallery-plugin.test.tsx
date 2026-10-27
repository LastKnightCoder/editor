// 图册插件真实发布包：经 SDK 外框、元素运行时、媒体组件与资源声明接入编辑器。
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Descendant, Element } from "slate";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { getElementResources } from "@tau/editor/api";
import { IEditorSlots, IMediaAppearance } from "@tau/editor/extensions/media/services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { mediaUiExtension } from "@tau/editor/extensions/media";
import { configureMedia } from "@tau/plugins/media";
import { ContentPluginRegistry } from "@tau/plugins/content";
import { PluginEnvironmentProvider } from "@tau/plugins/environment-host";
import "@tau/plugins/source-editor-host";
import { galleryDefinition, galleryExtension } from "../../test-fixtures/plugin-packages";

// jsdom 没有布局：容器宽度固定为 600
globalThis.ResizeObserver = class {
  constructor(private callback: ResizeObserverCallback) {}
  observe() {
    this.callback([{ contentRect: { width: 600 } } as ResizeObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

configureMedia({
  useResource: url => ({ src: url, status: "ready", retry: () => undefined }),
  useResourceUpload: () => undefined,
  useMediaAppearance: () => ({ borderRadius: "lg" }),
  MediaImage: props => createElement("img", { src: props.url, alt: props.alt, "data-media": "" }),
  MediaVideo: () => null,
  MediaAudio: () => null,
});

const text = () => ({ type: "formatted", text: "" });
const gallery = (images: { url: string; desc?: string }[], mode = 2) =>
  ({
    type: "image-gallery",
    mode,
    images: images.map((image, index) => ({
      id: String(index),
      width: 100,
      height: 100,
      ...image,
    })),
    children: [text()],
  }) as unknown as Descendant;
const paragraph = () => ({ type: "paragraph", children: [text()] }) as unknown as Descendant;

describe("图册插件", () => {
  let root: Root | undefined;
  let host: HTMLDivElement;

  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
  });

  const mount = async (value: Descendant[], readonly = false) => {
    const kit = createEditorKit({
      extensions: [galleryExtension, mediaUiExtension],
      services: [
        register => {
          register(IEditorSlots, createDefaultEditorSlots());
          register(IMediaAppearance, { borderRadius: "sm" });
        },
      ],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const ref = createRef<EditorRef>();
    await act(async () => {
      root!.render(
        <PluginEnvironmentProvider
          value={{ platform: "desktop", input: { coarsePointer: false, finePointer: true } }}
        >
          <DndProvider backend={HTML5Backend}>
            <Editor ref={ref} kit={kit} initValue={value} readonly={readonly} />
          </DndProvider>
        </PluginEnvironmentProvider>
      );
    });
    return ref.current!.getEditor();
  };

  const body = () => host.querySelector<HTMLElement>("[data-element-frame] > div")!;
  const press = (key: string) =>
    act(async () => {
      body().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

  it("声明图片资源，渲染进外框，空图册显示添加入口", async () => {
    const editor = await mount([gallery([]), paragraph()]);
    expect(getElementResources(editor)["image-gallery"]).toEqual([
      { path: "images[].url", kind: "image", alt: "desc", caption: "desc" },
    ]);
    expect(host.querySelector("[data-element-frame]")).toBeTruthy();
    expect(host.textContent).toContain("添加图片到图册");
  });

  it("点选后出现属性条，切换布局写回节点；Enter 打开编辑弹窗", async () => {
    const editor = await mount([gallery([{ url: "a.png" }, { url: "b.png" }], 1), paragraph()]);
    await act(async () => body().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    const toolbar = host.querySelector('[role="toolbar"][aria-label="图册属性"]');
    expect(toolbar).toBeTruthy();
    await act(async () =>
      toolbar!.querySelector<HTMLButtonElement>('[aria-label="瀑布流"]')!.click()
    );
    expect((editor.children[0] as Element & { mode: number }).mode).toBe(2);
    await press("Enter");
    expect(document.body.textContent).toContain("编辑图册");
  });

  it("选中后 Delete 删除图册并留下空段落", async () => {
    const editor = await mount([gallery([{ url: "a.png" }]), paragraph()]);
    await act(async () => body().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await press("Delete");
    expect(editor.children.map(node => (node as Element).type)).toEqual(["paragraph", "paragraph"]);
  });

  it("只读时不选中，单击图片打开文档图片查看器", async () => {
    await mount([gallery([{ url: "a.png", desc: "清晨" }, { url: "b.png" }]), paragraph()], true);
    await act(async () => body().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const tiles = host.querySelectorAll<HTMLElement>("[data-element-frame] img");
    expect(tiles).toHaveLength(2);
    await act(async () => tiles[0].click());
    expect(document.body.querySelector('[aria-label="图片预览"]')).toBeTruthy();
  });

  it("内容插件注册 Markdown 与 HTML 导出及资源声明", async () => {
    const registry = new ContentPluginRegistry();
    registry.install([galleryDefinition]);
    await registry.prepareContracts();
    expect(registry.resources["image-gallery"]?.[0]).toMatchObject({ path: "images[].url" });
    const html = registry
      .htmlSerializer("image-gallery")!
      .toHtml(gallery([{ url: "a.png" }, { url: "b.png" }]) as never);
    expect(html).toContain('src="a.png"');
    expect(html).toContain("左右滑动查看更多");
    const codec = galleryDefinition.editorCodecs?.find(item => item.type === "image-gallery");
    expect(
      codec?.serializer?.toMarkdown?.(
        gallery([{ url: "a.png" }]) as never,
        [] as never,
        {} as never
      )
    ).toBe("![](a.png)");
  });
});
