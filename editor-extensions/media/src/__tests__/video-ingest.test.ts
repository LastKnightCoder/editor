import { createEditor, Editor, Element, Node, Transforms } from "slate";
import { describe, expect, it, vi } from "vitest";
import { createParagraph, type IngestContext } from "@tau/editor/api";
import { videoIngestSpec } from "../extensions/video/ingest";
import { audioIngestSpec } from "../extensions/audio/ingest";

function deferred() {
  let resolve: (value: string) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<string>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(upload: () => Promise<string>) {
  const editor = createEditor();
  const following = createParagraph();
  following.children = [{ type: "formatted", text: "后文" }];
  editor.children = [createParagraph(), following];
  editor.isVoid = element => element.type === "video";
  editor.getService = () => ({ upload }) as never;
  editor.tryGetService = () => ({ error: vi.fn() }) as never;
  Transforms.select(editor, Editor.start(editor, [0]));
  const context: IngestContext = {
    editor,
    source: "paste",
    data: {} as DataTransfer,
    files: [new File(["视频"], "a.mp4", { type: "video/mp4" })],
  };
  return { editor, context };
}

describe("视频上传目标跟踪", () => {
  it.each([
    ["audio", "paste"],
    ["audio", "drop"],
    ["video", "paste"],
    ["video", "drop"],
  ] as const)("%s %s 批次首个失败后后续文件仍留在原位置", async (kind, source) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const first = deferred();
      const upload = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce("second-url");
      const { editor, context } = setup(upload);
      editor.isVoid = element => element.type === kind;
      context.source = source;
      context.point = source === "drop" ? { path: [0, 0], offset: 0 } : undefined;
      context.files = ["first", "second"].map(
        name => new File(["媒体"], name, { type: kind + "/test" })
      );
      const spec = kind === "audio" ? audioIngestSpec : videoIngestSpec;
      const task = spec.files.run(context);
      expect(editor.children.filter(node => node.type === kind)).toHaveLength(2);
      const prefix = createParagraph();
      prefix.children = [{ type: "formatted", text: "前文" }];
      Transforms.insertNodes(editor, prefix, { at: [0] });
      Transforms.select(editor, Editor.start(editor, [0]));
      first.reject(new Error("第一个文件失败"));
      await task;
      const nodes = editor.children.filter(node => node.type === kind);
      expect(nodes).toHaveLength(source === "drop" ? 2 : 1);
      expect(nodes.at(-1)).toMatchObject({ src: "second-url", uploading: false });
      if (source === "drop") expect(nodes[0]).toMatchObject({ src: "", uploading: false });
      expect(Node.string(editor)).toBe("前文后文");
      expect(editor.pathRefs().size).toBe(0);
    } finally {
      error.mockRestore();
    }
  });

  it.each(["成功", "粘贴失败", "拖放失败", "删除后成功", "删除后失败", "替换后成功", "替换后失败"])(
    "%s 不回填或删除其他占位",
    async scenario => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const pending = deferred();
        const { editor, context } = setup(() => pending.promise);
        if (scenario === "拖放失败") {
          context.source = "drop";
          context.point = { path: [0, 0], offset: 0 };
        }
        const task = videoIngestSpec.files.run(context);
        const prefix = createParagraph();
        prefix.children = [{ type: "formatted", text: "前文" }];
        Transforms.insertNodes(editor, prefix, { at: [0] });
        if (scenario.startsWith("删除后") || scenario.startsWith("替换后")) {
          Transforms.removeNodes(editor, { at: [1] });
        }
        if (scenario.startsWith("替换后")) {
          Transforms.insertNodes(
            editor,
            {
              type: "video",
              src: "",
              uploading: true,
              uuid: "其他上传",
              children: [{ type: "formatted", text: "" }],
            },
            { at: [1] }
          );
        }
        if (scenario.endsWith("失败")) pending.reject(new Error("上传失败"));
        else pending.resolve("video-url");
        await task;
        expect(Node.string(editor)).toBe("前文后文");
        const videos = [...Editor.nodes(editor, { at: [], match: node => node.type === "video" })];
        if (scenario === "成功")
          expect(videos[0][0]).toMatchObject({ src: "video-url", uploading: false });
        else if (scenario === "拖放失败")
          expect(videos[0][0]).toMatchObject({ src: "", uploading: false });
        else if (scenario.startsWith("替换后"))
          expect(videos[0][0]).toMatchObject({
            src: "",
            uploading: true,
            uuid: "其他上传",
          });
        else expect(videos).toHaveLength(0);
        expect(editor.pathRefs().size).toBe(0);
      } finally {
        error.mockRestore();
      }
    }
  );

  it("并发上传逆序完成且路径移动后仍对应各自占位", async () => {
    const first = deferred(),
      second = deferred();
    const upload = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { editor, context } = setup(upload);
    const firstTask = videoIngestSpec.files.run(context);
    Transforms.select(editor, Editor.end(editor, [1]));
    const secondTask = videoIngestSpec.files.run(context);
    Transforms.insertNodes(editor, createParagraph(), { at: [0] });
    second.resolve("second-url");
    await secondTask;
    first.resolve("first-url");
    await firstTask;
    const videos = [...Editor.nodes(editor, { at: [], match: node => node.type === "video" })];
    expect(
      videos.map(([node]) => Element.isElement(node) && node.type === "video" && node.src)
    ).toEqual(["first-url", "second-url"]);
    expect(editor.pathRefs().size).toBe(0);
  });
});
