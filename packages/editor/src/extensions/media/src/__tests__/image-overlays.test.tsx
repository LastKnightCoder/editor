import { act, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import type { ImageCropTransform } from "../components/ImageCropEditor/geometry";
import { Editor, createEditorKit, defaultMenuExtension, type EditorRef } from "@tau/editor";
import { IOverlayBackDismiss, type OverlayBackDismissProps } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";
import { image, inlineImage, openMediaUrlInput } from "../index";
import { IMediaActions, IEditorSlots } from "../../services";
import { createDefaultEditorSlots } from "../../slots";
import { imageActionsMap } from "../extensions/image/utils/actionsMap";

type CropResult = { transform: ImageCropTransform; blob: Blob; ext: string };
const controls = vi.hoisted(() => ({
  tasks: [] as Promise<void>[],
  confirm: undefined as ((result: CropResult) => Promise<void>) | undefined,
}));
// jsdom 无实际裁剪画布；使用真实图片组件、动作和宿主仲裁，只替代像素处理 UI。
vi.mock("../components/ImageCropEditor", () => ({
  default: ({
    onConfirm,
  }: {
    onConfirm: (result: {
      transform: ImageCropTransform;
      blob: Blob;
      ext: string;
    }) => Promise<void>;
  }) => {
    controls.confirm = onConfirm;
    return (
      <button
        data-crop-confirm
        onClick={() => {
          controls.tasks.push(
            onConfirm({ transform: {} as ImageCropTransform, blob: new Blob(["crop"]), ext: "png" })
          );
        }}
      >
        裁剪确认
      </button>
    );
  },
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
    extensions: [image, inlineImage, defaultMenuExtension],
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
    for (const img of view.host.querySelectorAll("img"))
      Object.defineProperty(img, "currentSrc", { configurable: true, value: img.src });
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
    for (const img of view.host.querySelectorAll("img"))
      Object.defineProperty(img, "currentSrc", { configurable: true, value: img.src });
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

it("裁剪期间修改说明和宽度不会丢弃结果，也不会覆盖新属性", async () => {
  let finish!: (url: string) => void;
  const view = await mount(
    () =>
      new Promise<string>(resolve => {
        finish = resolve;
      })
  );
  try {
    await view.render(false);
    for (const img of view.host.querySelectorAll("img"))
      Object.defineProperty(img, "currentSrc", { configurable: true, value: img.src });
    await act(async () => view.actions()?.startCrop());
    await act(async () =>
      view.host.querySelector<HTMLButtonElement>("[data-crop-confirm]")?.click()
    );
    await act(async () =>
      Transforms.setNodes(view.editor, { description: "新说明", width: 321 }, { at: [0] })
    );
    await act(async () => {
      finish("cropped");
      await controls.tasks[0];
    });
    expect(view.editor.children[0]).toMatchObject({
      previewUrl: "cropped",
      description: "新说明",
      width: 321,
    });
    expect(view.editor.pathRefs().size).toBe(0);
  } finally {
    await view.dispose();
  }
});

it("关闭再打开裁剪器，旧像素导出回调不能认领新会话", async () => {
  const upload = vi.fn(async () => "cropped");
  const view = await mount(upload);
  try {
    await view.render(false);
    for (const img of view.host.querySelectorAll("img"))
      Object.defineProperty(img, "currentSrc", { configurable: true, value: img.src });
    await act(async () => view.actions()?.startCrop());
    const oldConfirm = controls.confirm;
    if (!oldConfirm) throw new Error("裁剪器未挂载");
    await act(async () => [...view.dismissals][0]());
    await act(async () => view.actions()?.startCrop());
    await act(async () =>
      oldConfirm({ transform: {} as ImageCropTransform, blob: new Blob(["old"]), ext: "png" })
    );
    expect(upload).not.toHaveBeenCalled();
    expect(view.host.querySelector("[data-crop-confirm]")).not.toBeNull();
  } finally {
    await view.dispose();
  }
});

it("关闭裁剪后可重试，旧上传晚于新上传返回也不会覆盖", async () => {
  let finish!: (url: string) => void;
  const upload = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          finish = resolve;
        })
    )
    .mockResolvedValue("new-crop");
  const view = await mount(upload);
  try {
    await view.render(false);
    for (const img of view.host.querySelectorAll("img"))
      Object.defineProperty(img, "currentSrc", { configurable: true, value: img.src });
    await act(async () => view.actions()?.startCrop());
    await act(async () =>
      view.host.querySelector<HTMLButtonElement>("[data-crop-confirm]")?.click()
    );
    await act(async () => [...view.dismissals][0]());
    await act(async () => view.actions()?.startCrop());
    await act(async () =>
      view.host.querySelector<HTMLButtonElement>("[data-crop-confirm]")?.click()
    );
    await act(async () => controls.tasks[1]);
    await act(async () => {
      finish("old-crop");
      await controls.tasks[0];
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(view.editor.children[0]).toMatchObject({ previewUrl: "new-crop" });
    expect(view.editor.pathRefs().size).toBe(0);
  } finally {
    await view.dispose();
  }
});

it("媒体更多菜单由核心聚合已有贡献并经命令执行", async () => {
  const view = await mount(async () => "uploaded");
  try {
    await view.render(false);
    const frame = view.host.querySelector(".cursor-pointer.relative.overflow-hidden");
    if (!frame) throw new Error("图片选择区域缺失");
    await act(async () => frame.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const more = view.host.querySelector<HTMLButtonElement>('button[aria-label="更多"]');
    expect(more).not.toBeNull();
    await act(async () => more?.click());
    const edit = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      button => button.textContent === "添加说明"
    );
    expect(edit).toBeDefined();
    const actions = view.actions();
    if (!actions) throw new Error("图片动作未注册");
    const editDescription = vi.spyOn(actions, "showDescEditor");
    await act(async () => edit?.click());
    expect(editDescription).toHaveBeenCalledOnce();
  } finally {
    await view.dispose();
  }
});

it("更多菜单打开后目标移动，删除仍只作用于原图片", async () => {
  const view = await mount(async () => "uploaded");
  try {
    await view.render(false);
    const frame = view.host.querySelector(".cursor-pointer.relative.overflow-hidden");
    if (!frame) throw new Error("图片未挂载");
    await act(async () => frame.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () =>
      view.host.querySelector<HTMLButtonElement>('button[aria-label="更多"]')?.click()
    );
    await act(async () =>
      Transforms.insertNodes(
        view.editor,
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "保留新增正文" }],
        },
        { at: [0] }
      )
    );
    const remove = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      button => button.textContent === "删除"
    );
    if (!remove) throw new Error("删除菜单未挂载");
    await act(async () => remove.click());
    expect(view.editor.children.some(node => node.type === "image")).toBe(false);
    expect(JSON.stringify(view.editor.children)).toContain("保留新增正文");
  } finally {
    await view.dispose();
  }
});

it.each(["Escape", "宿主返回"])("更多菜单通过%s关闭，释放登记并归还焦点", async source => {
  const view = await mount(async () => "uploaded");
  try {
    await view.render(false);
    const frame = view.host.querySelector(".cursor-pointer.relative.overflow-hidden");
    if (!frame) throw new Error("图片未挂载");
    await act(async () => frame.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const more = view.host.querySelector<HTMLButtonElement>('button[aria-label="更多"]');
    if (!more) throw new Error("更多按钮未挂载");
    await act(async () => more.focus());
    await act(async () => more.click());
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) throw new Error("菜单未挂载");
    expect(document.activeElement).toBe(menu);
    expect(view.dismissals.size).toBe(1);
    await act(async () => {
      if (source === "Escape")
        menu.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
        );
      else [...view.dismissals][0]();
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(view.dismissals.size).toBe(0);
    expect(document.activeElement).toBe(more);
  } finally {
    await view.dispose();
  }
});

it("只读编辑器不打开网络媒体输入，也不写入内容", async () => {
  const view = await mount(async () => "uploaded");
  try {
    const before = structuredClone(view.editor.children);
    await act(async () => openMediaUrlInput(view.editor, "image"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(view.editor.children).toEqual(before);
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

it("关闭行内上传面板后，迟到上传不写入原节点", async () => {
  let finish!: (url: string) => void;
  const upload = vi.fn(
    () =>
      new Promise<string>(resolve => {
        finish = resolve;
      })
  );
  const view = await mount(upload, true);
  try {
    await view.render(false);
    const button = [...view.host.querySelectorAll("button")].find(
      item => item.textContent?.trim() === "上传图片"
    );
    if (!button) throw new Error("上传入口缺失");
    await act(async () => button.click());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("文件输入缺失");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["x"], "a.png", { type: "image/png" })],
    });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(upload).toHaveBeenCalledTimes(1);
    const before = structuredClone(view.editor.children);
    await act(async () => [...view.dismissals][0]());
    await act(async () => {
      finish("late-result");
      await Promise.resolve();
    });
    expect(view.editor.children).toEqual(before);
    expect(view.editor.pathRefs().size).toBe(0);
  } finally {
    await view.dispose();
  }
});
