import { act, createRef, forwardRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Transforms } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { image } from "@tau/editor/extensions/media";
import { IEditorSlots, type EditorSlots } from "@tau/editor/extensions/media/services";

// 模拟生产分包循环依赖：注册表先求值，媒体组件随后才完成初始化。
const components = vi.hoisted(() => ({
  Image: undefined as EditorSlots["Image"] | undefined,
  Video: undefined as EditorSlots["Video"] | undefined,
  Audio: undefined as EditorSlots["Audio"] | undefined,
}));
vi.mock("@/components/LocalImage", () => ({
  get default() {
    return components.Image;
  },
}));
vi.mock("@/components/LocalVideo", () => ({
  get default() {
    return components.Video;
  },
}));
vi.mock("@/components/LocalAudio", () => ({
  get default() {
    return components.Audio;
  },
}));
vi.mock("@/commands/file", () => ({ getHomeDir: async () => "/home/test" }));
vi.mock("@/utils", () => ({ remoteResourceToLocal: vi.fn() }));
vi.mock("@/utils/markdown", () => ({ importFromMarkdown: vi.fn() }));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: vi.fn() }));

import { desktopEditorSlots } from "../editorServiceImplementations";

components.Image = forwardRef<HTMLImageElement, { url: string }>(({ url }, ref) => (
  <img ref={ref} src={url} />
));
components.Video = forwardRef<HTMLVideoElement, { src: string }>((props, ref) => (
  <video {...props} ref={ref} />
));
components.Audio = forwardRef<HTMLAudioElement, { src: string }>((props, ref) => (
  <audio {...props} ref={ref} />
));

it("媒体组件晚于服务模块初始化时，插槽仍返回完整组件且保留引用身份", () => {
  expect(desktopEditorSlots.Image).toBe(components.Image);
  expect(desktopEditorSlots.Video).toBe(components.Video);
  expect(desktopEditorSlots.Audio).toBe(components.Audio);
  expect({ ...desktopEditorSlots }).toEqual(components);
});

it("初始化顺序不影响已有本地图片与新插入图片的渲染", async () => {
  const kit = createEditorKit({
    extensions: [image],
    services: [register => register(IEditorSlots, desktopEditorSlots)],
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const ref = createRef<EditorRef>();
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={kit}
            initValue={[
              {
                type: "image",
                url: "/resources/existing.png",
                children: [{ type: "formatted", text: "" }],
              },
            ]}
          />
        </DndProvider>
      )
    );
    expect(host.querySelector("[data-element-placeholder]")).toBeNull();
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/resources/existing.png");
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    await act(async () =>
      Transforms.insertNodes(
        editor,
        {
          type: "image",
          url: "/resources/inserted.png",
          children: [{ type: "formatted", text: "" }],
        },
        { at: [1] }
      )
    );
    expect(host.querySelector("[data-element-placeholder]")).toBeNull();
    expect([...host.querySelectorAll("img")].map(img => img.getAttribute("src"))).toEqual([
      "/resources/existing.png",
      "/resources/inserted.png",
    ]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
