import { createEditor, Editor, Node, Transforms } from "slate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { audioIngestSpec } from "../ingest";
import { type IngestContext, type ParagraphElement } from "@tau/editor/api";

const paragraph = (text: string): ParagraphElement => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

afterEach(() => vi.restoreAllMocks());

describe("音频异步上传定位", () => {
  it.each(["成功", "粘贴失败", "拖放失败", "删除后成功", "删除后失败"] as const)(
    "%s只回填或清理仍存在的上传节点",
    async scenario => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const editor = createEditor();
      editor.children = [paragraph(""), paragraph("后文")];
      editor.isVoid = element => element.type === "audio";
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      let resolveUpload!: (url: string) => void;
      let rejectUpload!: (error: Error) => void;
      const resource = {
        upload: () =>
          new Promise<string>((resolve, reject) => {
            resolveUpload = resolve;
            rejectUpload = reject;
          }),
      };
      editor.getService = () => resource as never;
      const notifier = { error: vi.fn() };
      editor.tryGetService = id => (id.id === "resourceService" ? resource : notifier) as never;
      const dropping = scenario === "拖放失败";
      const context: IngestContext = {
        editor,
        files: [new File(["音频"], "a.mp3", { type: "audio/mpeg" })],
        data: {} as DataTransfer,
        source: dropping ? "drop" : "paste",
        point: dropping ? { path: [0, 0], offset: 0 } : undefined,
      };
      const task = audioIngestSpec.files.run(context);
      Transforms.insertNodes(editor, paragraph("新增正文"), { at: [0] });
      if (scenario.startsWith("删除后")) Transforms.removeNodes(editor, { at: [1] });
      if (scenario.endsWith("失败")) rejectUpload(new Error("上传失败"));
      else resolveUpload("audio-url");
      await task;

      expect(Node.string(editor)).toBe("新增正文后文");
      expect(editor.children[0]).not.toHaveProperty("src");
      const audio = [...Editor.nodes(editor, { at: [], match: node => node.type === "audio" })];
      if (scenario === "成功")
        expect(audio[0][0]).toMatchObject({ src: "audio-url", uploading: false });
      else if (dropping) expect(audio[0][0]).toMatchObject({ src: "", uploading: false });
      else expect(audio).toHaveLength(0);
      expect(editor.pathRefs().size).toBe(0);
    }
  );
});
