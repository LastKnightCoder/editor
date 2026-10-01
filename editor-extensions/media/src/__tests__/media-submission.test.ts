import { createEditor, Transforms } from "slate";
import { expect, it, vi } from "vitest";
import { beginMediaSubmission } from "../utils/mediaSubmission";
import { uploadMedia } from "../utils/uploadMedia";
import type { ImageElement } from "../types";

function setup() {
  const editor = createEditor();
  const image: ImageElement = {
    type: "image",
    url: "original",
    children: [{ type: "formatted", text: "" }],
  };
  editor.children = [image];
  editor.isVoid = node => node.type === "image";
  const upload = vi.fn(async () => "uploaded");
  const resource = { upload };
  editor.getService = () => resource as never;
  const error = vi.fn();
  const notifier = { error };
  editor.tryGetService = id => (id.id === "resourceService" ? resource : notifier) as never;
  return { editor, image, resource, error };
}

it("媒体写入允许说明/宽度修改及节点移动，并保留这些修改", async () => {
  const { editor, image } = setup();
  const operation = beginMediaSubmission(editor, image, { path: [0] });
  Transforms.setNodes(editor, { description: "新说明", width: 200 }, { at: [0] });
  Transforms.insertNodes(
    editor,
    { type: "paragraph", children: [{ type: "formatted", text: "前文" }] },
    { at: [0] }
  );
  expect(await uploadMedia(editor, new File(["x"], "a.png"), operation)).toBe(true);
  expect(editor.children[1]).toMatchObject({ url: "uploaded", description: "新说明", width: 200 });
  expect(editor.pathRefs().size).toBe(0);
});

it.each(["资源", "预览", "服务"])("%s发生变化时丢弃旧媒体操作", async changed => {
  const { editor, image, error } = setup();
  const operation = beginMediaSubmission(editor, image, { path: [0] });
  if (changed === "资源") Transforms.setNodes(editor, { url: "replacement" }, { at: [0] });
  if (changed === "预览") Transforms.setNodes(editor, { previewUrl: "other-crop" }, { at: [0] });
  if (changed === "服务") {
    const replacement = { upload: vi.fn(async () => "other") };
    editor.getService = () => replacement as never;
    editor.tryGetService = id => (id.id === "resourceService" ? replacement : { error }) as never;
  }
  const before = structuredClone(editor.children);
  expect(await uploadMedia(editor, new File(["x"], "a.png"), operation)).toBe(false);
  expect(editor.children).toEqual(before);
  expect(error).not.toHaveBeenCalled();
  expect(editor.pathRefs().size).toBe(0);
});

it("同一目标只允许一个在途资源操作，释放后可重试", () => {
  const { editor, image } = setup();
  const first = beginMediaSubmission(editor, image, { path: [0] });
  expect(first).not.toBeNull();
  expect(beginMediaSubmission(editor, image, { path: [0] })).toBeNull();
  first?.dispose();
  const retry = beginMediaSubmission(editor, image, { path: [0] });
  expect(retry).not.toBeNull();
  retry?.dispose();
  expect(editor.pathRefs().size).toBe(0);
});

it("提交变换异常继续抛出，不伪报上传失败或吞掉异常", async () => {
  const { editor, image, error } = setup();
  const operation = beginMediaSubmission(editor, image, { path: [0] });
  const failure = new Error("变换失败");
  const setNodes = vi.spyOn(Transforms, "setNodes").mockImplementation(() => {
    throw failure;
  });
  try {
    await expect(uploadMedia(editor, new File(["x"], "a.png"), operation)).rejects.toBe(failure);
    expect(error).not.toHaveBeenCalled();
    expect(editor.pathRefs().size).toBe(0);
  } finally {
    setNodes.mockRestore();
  }
});
