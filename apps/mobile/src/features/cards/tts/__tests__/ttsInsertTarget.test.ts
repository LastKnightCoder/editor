import { describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms, type Descendant } from "slate";
import { withHistory } from "slate-history";
import { IResourceService } from "@tau/shared/host-services";

import {
  captureTtsInsertTarget,
  selectedPlainText,
  ttsAudioFile,
  ttsAudioTitle,
  type TtsInsertTarget,
} from "../ttsInsertTarget";

const warning = vi.hoisted(() => vi.fn());
vi.mock("@tau/editor/api", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor/api")>()),
  notifierOf: () => ({ warning }),
}));

const paragraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const audio = (extra: Record<string, unknown> = {}) => ({
  type: "audio",
  src: "old.mp3",
  children: [{ type: "formatted", text: "" }],
  ...extra,
});

function createTtsEditor(children: unknown[], upload = vi.fn(async () => "resources/tts.mp3")) {
  const editor = withHistory(createEditor());
  editor.isVoid = element => (element as { type?: string }).type === "audio";
  editor.children = children as Descendant[];
  Object.assign(editor, {
    getService: (id: unknown) => {
      if (id === IResourceService) return { upload };
      throw new Error("unexpected service");
    },
    tryGetService: () => undefined,
  });
  return { editor, upload };
}

function capture(...args: Parameters<typeof captureTtsInsertTarget>): TtsInsertTarget {
  const target = captureTtsInsertTarget(...args);
  if (!target) throw new Error("未能锁定写入位置");
  return target;
}

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" });
const typeAt = (editor: Editor, index: number) => (editor.children[index] as { type: string }).type;

describe("ttsAudioTitle / ttsAudioFile", () => {
  it("标题取前 12 个字并单行化", () => {
    expect(ttsAudioTitle("短句")).toBe("短句 · 朗读");
    expect(ttsAudioTitle("艾宾浩斯遗忘曲线说明\n记忆在学习后")).toBe(
      "艾宾浩斯遗忘曲线说明 记… · 朗读"
    );
  });

  it("按 mime 选扩展名", () => {
    expect(ttsAudioFile(new Blob([], { type: "audio/wav" })).name).toMatch(/\.wav$/);
    expect(ttsAudioFile(new Blob([])).type).toBe("audio/mpeg");
  });
});

describe("selectedPlainText", () => {
  it("跨块选区按换行拼接，折叠选区为空", () => {
    const { editor } = createTtsEditor([paragraph("第一段文字"), paragraph("第二段")]);
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [1, 0], offset: 2 },
    });
    expect(selectedPlainText(editor)).toBe("段文字\n第二");
    Transforms.collapse(editor);
    expect(selectedPlainText(editor)).toBe("");
  });
});

describe("captureTtsInsertTarget", () => {
  it("insert：空段落被音频替换，光标落到其后新段落", async () => {
    const { editor, upload } = createTtsEditor([paragraph("开头"), paragraph("")]);
    Transforms.select(editor, { path: [1, 0], offset: 0 });
    const target = capture(editor, { kind: "insert" });
    await expect(target.commit({ blob: blob(), text: "你好" })).resolves.toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(editor.children[1]).toMatchObject({
      type: "audio",
      src: "resources/tts.mp3",
      title: "你好 · 朗读",
      isFromGenerate: true,
      audioText: "你好",
    });
    expect(typeAt(editor, 2)).toBe("paragraph");
    expect(editor.selection?.anchor.path).toEqual([2, 0]);
  });

  it("after-selection：插在选区最后一个顶层块之后，生成期间改动该段仍有效", async () => {
    const { editor } = createTtsEditor([paragraph("第一段"), paragraph("第二段"), paragraph("尾")]);
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 3 },
    });
    const target = capture(editor, {
      kind: "after-selection",
      text: "第一段\n第二段",
    });
    Transforms.insertText(editor, "!", { at: { path: [1, 0], offset: 3 } });
    Transforms.insertNodes(editor, paragraph("新开头") as Descendant, { at: [0] });
    await expect(target.commit({ blob: blob(), text: "第一段\n第二段" })).resolves.toBe(true);
    expect(editor.children.map((_, index) => typeAt(editor, index))).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
      "audio",
      "paragraph",
    ]);
    expect(editor.selection?.anchor.path).toEqual([4, 0]);
  });

  it("插入是一个独立撤销步骤", async () => {
    const { editor } = createTtsEditor([paragraph("正文")]);
    Transforms.select(editor, { path: [0, 0], offset: 2 });
    const target = capture(editor, { kind: "after-selection", text: "正文" });
    await target.commit({ blob: blob(), text: "正文" });
    expect(editor.children).toHaveLength(3);
    editor.undo();
    expect(editor.children).toHaveLength(1);
  });

  it("replace：原地改写音频，保留用户起的标题", async () => {
    const { editor } = createTtsEditor([audio({ title: "周会录音" })]);
    const target = capture(editor, {
      kind: "replace",
      element: editor.children[0] as never,
      path: [0],
      text: "",
    });
    await expect(target.commit({ blob: blob(), text: "新的文字" })).resolves.toBe(true);
    expect(editor.children).toHaveLength(1);
    expect(editor.children[0]).toMatchObject({
      src: "resources/tts.mp3",
      title: "周会录音",
      isFromGenerate: true,
      audioText: "新的文字",
    });
  });

  it("replace：生成音频按新文本重命名", async () => {
    const { editor } = createTtsEditor([audio({ title: "旧 · 朗读", isFromGenerate: true })]);
    const target = capture(editor, {
      kind: "replace",
      element: editor.children[0] as never,
      path: [0],
      text: "旧",
    });
    await target.commit({ blob: blob(), text: "新" });
    expect(editor.children[0]).toMatchObject({ title: "新 · 朗读", audioText: "新" });
  });

  it("replace：生成期间音频被换成别的文件则放弃并提示", async () => {
    const { editor } = createTtsEditor([audio()]);
    const target = capture(editor, {
      kind: "replace",
      element: editor.children[0] as never,
      path: [0],
      text: "",
    });
    Transforms.setNodes(editor, { src: "user-picked.mp3" } as never, { at: [0] });
    warning.mockClear();
    await expect(target.commit({ blob: blob(), text: "文字" })).resolves.toBe(false);
    expect(editor.children[0]).toMatchObject({ src: "user-picked.mp3" });
    expect(warning).toHaveBeenCalled();
  });

  it("目标块被删除后放弃写入", async () => {
    const { editor } = createTtsEditor([paragraph("要删的段"), paragraph("留下")]);
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    const target = capture(editor, { kind: "after-selection", text: "要删的段" });
    Transforms.removeNodes(editor, { at: [0] });
    await expect(target.commit({ blob: blob(), text: "要删的段" })).resolves.toBe(false);
    expect(editor.children).toHaveLength(1);
  });

  it("insert：光标不在正文段落时无法锁定", () => {
    const { editor } = createTtsEditor([audio()]);
    Transforms.select(editor, { path: [0, 0], offset: 0 });
    expect(captureTtsInsertTarget(editor, { kind: "insert" })).toBeNull();
  });
});
