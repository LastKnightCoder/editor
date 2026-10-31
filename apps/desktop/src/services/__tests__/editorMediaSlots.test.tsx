import { act, createRef, forwardRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Transforms } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { IResourceService } from "@tau/shared/host-services";
import type { ContentCollaborationBinding } from "@tau/editor-collab";
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
vi.mock("@/services/editorKit", () => ({ getContentKit: vi.fn() }));

import { desktopEditorSlots } from "../editorServiceImplementations";
import { collaborationKit } from "@/hooks/useCollaborationKit";

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

it("本机与共享正文都沿用场景上传，共享时仅转换返回的本地路径", async () => {
  const upload = vi.fn(async () => "https://images.test/compressed.webp");
  const managedUpload = vi.fn(async () => "tau-collab-asset:shared");
  const resolveResource = vi.fn(async () => "/cache/legacy.png");
  const prepareResource = vi.fn(async (reference: string) =>
    reference.startsWith("https:") ? reference : "tau-collab-asset:shared"
  );
  const kit = createEditorKit({
    extensions: [image],
    services: [
      register => {
        register(IResourceService, { upload });
        register(IEditorSlots, desktopEditorSlots);
      },
    ],
  });
  const doc = new Y.Doc();
  doc.getMap("meta").set("version", 2);
  const awareness = new Awareness(doc);
  const binding: ContentCollaborationBinding = {
    mode: "local",
    role: "owner",
    doc,
    awareness,
    origin: {},
    uploadResource: managedUpload,
    prepareResource,
    resolveResource,
  };
  const file = new File(["image"], "image.png", { type: "image/png" });
  try {
    const local = collaborationKit(binding, kit).registry.get(IResourceService);
    await expect(local.upload(file)).resolves.toBe("https://images.test/compressed.webp");
    expect(upload).toHaveBeenCalledWith(file);
    expect(managedUpload).not.toHaveBeenCalled();
    await expect(local.remoteResourceToLocal!("tau-collab-local:legacy")).resolves.toBe(
      "/cache/legacy.png"
    );
    expect(resolveResource).toHaveBeenCalledWith("tau-collab-local:legacy");
    const shared = collaborationKit({ ...binding, mode: "shared" }, kit).registry.get(
      IResourceService
    );
    await expect(shared.upload(file)).resolves.toBe("https://images.test/compressed.webp");
    expect(prepareResource).toHaveBeenLastCalledWith("https://images.test/compressed.webp");
    upload.mockResolvedValueOnce("~/.editor/resources/compressed.webp");
    await expect(shared.upload(file)).resolves.toBe("tau-collab-asset:shared");
    expect(prepareResource).toHaveBeenLastCalledWith("~/.editor/resources/compressed.webp");
    expect(managedUpload).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(3);
    upload.mockRejectedValueOnce(new Error("图床上传失败"));
    await expect(shared.upload(file)).rejects.toThrow("图床上传失败");
    expect(prepareResource).toHaveBeenCalledTimes(2);
    const member = collaborationKit(
      { ...binding, mode: "shared", role: "editor" },
      kit
    ).registry.get(IResourceService);
    await expect(member.upload(file)).resolves.toBe("tau-collab-asset:shared");
    expect(managedUpload).toHaveBeenCalledWith(file);
    expect(upload).toHaveBeenCalledTimes(4);
    expect(prepareResource).toHaveBeenCalledTimes(2);
    const video = new File(["video"], "clip.mp4", { type: "video/mp4" });
    await shared.upload(video);
    expect(managedUpload).toHaveBeenLastCalledWith(video);
    expect(upload).toHaveBeenCalledTimes(4);
    expect(prepareResource).toHaveBeenCalledTimes(2);
  } finally {
    awareness.destroy();
    doc.destroy();
  }
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
