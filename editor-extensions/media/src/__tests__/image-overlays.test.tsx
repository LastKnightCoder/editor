import { act, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import type { CropperTransform } from "@tau/shared";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IOverlayBackDismiss, type OverlayBackDismissProps } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";
import { image, inlineImage } from "../index";
import { IMediaActions, IEditorSlots } from "../../services";
import { createDefaultEditorSlots } from "../../slots";
import { imageActionsMap } from "../extensions/image/utils/actionsMap";

const controls = vi.hoisted(() => ({ tasks: [] as Promise<void>[] }));
// jsdom 无实际裁剪画布；使用真实图片组件、动作和宿主仲裁，只替代像素处理 UI。
vi.mock("@tau/shared", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/shared")>()),
  ImageCropper: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: (transform: CropperTransform, blob: Blob) => Promise<void>;
  }) =>
    open ? (
      <button
        data-crop-confirm
        onClick={() => {
          controls.tasks.push(onConfirm({} as CropperTransform, new Blob(["crop"])));
        }}
      >
        裁剪确认
      </button>
    ) : null,
}));

async function mount(upload: (file: File) => Promise<string>, inline = false) {
  const dismissals = new Set<() => void>();
  function Layer({ onDismiss }: OverlayBackDismissProps) {
    useEffect(() => {
      dismissals.add(onDismiss);
      return () => {
        dismissals.delete(onDismiss);
      };
    }, [onDismiss]);
    return null;
  }
  const kit = createEditorKit({
    extensions: [image, inlineImage],
    services: [
      register => register(IResourceService, { upload }),
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => register(IOverlayBackDismiss, { Layer }),
      register =>
        register(IMediaActions, [
          {
            id: "test",
            label: "测试操作",
            mediaTypes: ["image"],
            Modal: ({ open }) => (open ? <div data-media-action /> : null),
          },
        ]),
    ],
  });
  const value: Descendant[] = inline
    ? [
        {
          type: "paragraph",
          children: [
            { type: "formatted", text: "" },
            {
              type: "inline-image",
              url: "",
              uuid: "inline",
              children: [{ type: "formatted", text: "" }],
            },
            { type: "formatted", text: "" },
          ],
        },
      ]
    : [{ type: "image", url: "original", children: [{ type: "formatted", text: "" }] }];
  const host = document.createElement("div"),
    ref = createRef<EditorRef>();
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
  await render(true);
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  const actions = () => {
    const target = editor.children[0];
    if (target.type !== "image") throw new Error("图片不存在");
    return imageActionsMap.get(target);
  };
  return {
    editor,
    host,
    render,
    actions,
    dismissals,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
      controls.tasks.length = 0;
    },
  };
}

it("图片裁剪和业务操作经宿主退场，只读不打开且不自动回写预览地址", async () => {
  const view = await mount(async () => "uploaded");
  try {
    expect(view.editor.children[0]).not.toHaveProperty("previewUrl");
    await act(async () => {
      view.actions()?.startCrop();
      view.actions()?.runMediaAction("test");
    });
    expect(view.dismissals.size).toBe(0);
    await view.render(false);
    await act(async () => view.actions()?.startCrop());
    expect(view.dismissals.size).toBe(1);
    await act(async () => [...view.dismissals][0]());
    expect(view.dismissals.size).toBe(0);
    await act(async () => view.actions()?.runMediaAction("test"));
    expect(view.host.querySelector("[data-media-action]")).toBeTruthy();
    expect(view.dismissals.size).toBe(1);
    await view.render(true);
    expect(view.dismissals.size).toBe(0);
    await view.render(false);
    expect(view.host.querySelector("[data-media-action]")).toBeNull();
    expect(view.dismissals.size).toBe(0);
  } finally {
    await view.dispose();
  }
});

it("裁剪上传等待期间替换图片，不把结果写入同位置的新节点", async () => {
  let finish: (url: string) => void = () => undefined;
  const view = await mount(
    () =>
      new Promise<string>(resolve => {
        finish = resolve;
      })
  );
  try {
    await view.render(false);
    await act(async () => view.actions()?.startCrop());
    await act(async () =>
      (view.host.querySelector("[data-crop-confirm]") as HTMLButtonElement).click()
    );
    expect(controls.tasks).toHaveLength(1);
    await act(async () => {
      Transforms.removeNodes(view.editor, { at: [0] });
      Transforms.insertNodes(
        view.editor,
        {
          type: "image",
          url: "replacement",
          children: [{ type: "formatted", text: "" }],
        },
        { at: [0] }
      );
    });
    await act(async () => {
      finish("cropped");
      await controls.tasks[0];
    });
    expect(view.editor.children[0]).toMatchObject({
      type: "image",
      url: "replacement",
      previewUrl: "replacement",
    });
    expect(view.editor.children[0]).not.toHaveProperty("cropTransform");
  } finally {
    await view.dispose();
  }
});

it("行内图片上传浮层接返回仲裁，只读不显示上传入口", async () => {
  const view = await mount(async () => "uploaded", true);
  const uploadButton = () =>
    [...view.host.querySelectorAll("button")].find(
      button => button.textContent?.trim() === "上传图片"
    );
  try {
    expect(uploadButton()).toBeUndefined();
    await view.render(false);
    await act(async () => uploadButton()?.click());
    expect(view.dismissals.size).toBe(1);
    await act(async () => [...view.dismissals][0]());
    expect(view.dismissals.size).toBe(0);
  } finally {
    await view.dispose();
  }
});
