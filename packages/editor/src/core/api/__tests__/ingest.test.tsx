// P8：内容注入认领管线（01 §5.4）——accept 匹配与分桶、paste 认领与下传顺序、
// text 认领、drop 落点、按扩展隔离熔断、相同 accept 建 kit 抛错。
import { describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms, type Editor as SlateEditor } from "slate";

import { ingestAccepts, type IngestSource } from "../ingest";
import { withIngest, resolveFileDropPoint } from "../../plugins/withIngest";
import { createCircuitBreaker, type ExtensionCircuitBreaker } from "../../kit/extensionGuard";
import { defineElement, defineExtension } from "../extension";
import { createEditorKit } from "../../index";

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });

/** jsdom 没有可构造的 DataTransfer / FileList，按管线的消费面造假 */
const fakeTransfer = (files: File[] = [], values: Record<string, string> = {}) =>
  ({
    files: {
      length: files.length,
      item: (index: number) => files[index] ?? null,
      ...(Object.fromEntries(files.map((file, index) => [String(index), file])) as Record<
        string,
        File
      >),
      [Symbol.iterator]: function* () {
        for (const file of files) yield file;
      },
    },
    getData: (mime: string) => values[mime] ?? "",
  }) as unknown as DataTransfer;

const imageFile = (name = "a.png") => new File(["x"], name, { type: "image/png" });

const fakeBreaker = (): ExtensionCircuitBreaker => {
  const recorded: Array<{ owner: string; phase: string }> = [];
  const disabled = new Set<string>();
  const breaker = createCircuitBreaker(() => ({ report: () => {} }));
  return {
    isDisabled: owner => disabled.has(owner) || breaker.isDisabled(owner),
    record: (owner, phase, error) => {
      recorded.push({ owner, phase });
      breaker.record(owner, phase, error);
    },
    report: (owner, phase) => recorded.push({ owner, phase }),
    recorded,
    disable: (owner: string) => disabled.add(owner),
  } as unknown as ExtensionCircuitBreaker;
};

const withSources = (
  editor: SlateEditor,
  sources: readonly IngestSource[],
  breaker = fakeBreaker()
) =>
  withIngest(editor, sources, breaker) as SlateEditor & {
    insertData: (data: DataTransfer) => Promise<void>;
  };

describe("ingestAccepts", () => {
  it("通配前缀、精确 MIME、全收三种匹配", () => {
    expect(ingestAccepts("image/*", "image/png")).toBe(true);
    expect(ingestAccepts("image/*", "image/jpeg")).toBe(true);
    expect(ingestAccepts("image/*", "video/mp4")).toBe(false);
    expect(ingestAccepts("application/pdf", "application/pdf")).toBe(true);
    expect(ingestAccepts("application/pdf", "application/json")).toBe(false);
    expect(ingestAccepts("*", "anything/at-all")).toBe(true);
  });
});

describe("withIngest · paste", () => {
  it("files 按声明分桶认领：每个文件只归第一个匹配的声明，认领即消费不再下传", async () => {
    const imageRun = vi.fn();
    const pdfRun = vi.fn();
    const fallback = vi.fn();
    const editor = createEditor();
    const { insertData } = editor;
    editor.insertData = async () => fallback();
    const wrapped = withSources(editor, [
      { owner: "a", files: { accept: "image/*", run: imageRun } },
      { owner: "b", files: { accept: "application/pdf", run: pdfRun } },
    ]);

    const pdf = new File(["x"], "d.pdf", { type: "application/pdf" });
    await wrapped.insertData(fakeTransfer([imageFile(), pdf]));

    expect(imageRun).toHaveBeenCalledTimes(1);
    expect(imageRun.mock.calls[0][0].files).toHaveLength(1);
    expect(pdfRun).toHaveBeenCalledTimes(1);
    expect(pdfRun.mock.calls[0][0].files[0]).toBe(pdf);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("没有任何声明认领时下传默认链（markdown 导入等）", async () => {
    const fallback = vi.fn();
    const editor = createEditor();
    editor.insertData = async () => fallback();
    const wrapped = withSources(editor, [
      { owner: "a", files: { accept: "image/*", run: vi.fn() } },
    ]);

    await wrapped.insertData(fakeTransfer([], { "text/plain": "普通文本" }));
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("Slate 自有片段优先原样下传，不经认领", async () => {
    const imageRun = vi.fn();
    const fallback = vi.fn();
    const editor = createEditor();
    editor.insertData = async () => fallback();
    const wrapped = withSources(editor, [
      { owner: "a", files: { accept: "image/*", run: imageRun } },
    ]);

    await wrapped.insertData(
      fakeTransfer([imageFile()], { "application/x-slate-fragment": "eyJjaGlsZHJlbiI6W119" })
    );
    expect(imageRun).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("text 认领：第一个 when 为真的声明消费，其余与默认链都不再走", async () => {
    const csvRun = vi.fn();
    const declined = vi.fn();
    const fallback = vi.fn();
    const editor = createEditor();
    editor.insertData = async () => fallback();
    const wrapped = withSources(editor, [
      {
        owner: "csv",
        text: { when: data => data.getData("text/plain").startsWith("col1,"), run: csvRun },
      },
      { owner: "other", text: { when: () => true, run: declined } },
    ]);

    await wrapped.insertData(fakeTransfer([], { "text/plain": "col1,col2\n1,2" }));
    expect(csvRun).toHaveBeenCalledTimes(1);
    expect(declined).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe("withIngest · drop 与隔离", () => {
  it("drop 把文件分桶交给 run，落点先选中", async () => {
    const editor = createEditor();
    editor.children = [paragraph("一"), paragraph("二")] as any;
    const run = vi.fn();
    const wrapped = withIngest(
      editor,
      [{ owner: "a", files: { accept: "image/*", run } }],
      fakeBreaker()
    ) as SlateEditor;

    await wrapped.handleDrop(fakeTransfer([imageFile()]), { path: [1, 0], offset: 0 });

    expect(run).toHaveBeenCalledTimes(1);
    // 落点已选中：选区在第二个段落
    expect(editor.selection?.anchor.path).toEqual([1, 0]);
  });

  it("run 抛错记入贡献扩展的熔断（phase=ingest），不牵连其他认领者", async () => {
    const breaker = fakeBreaker();
    const goodRun = vi.fn();
    const editor = createEditor();
    const wrapped = withIngest(
      editor,
      [
        {
          owner: "bad",
          files: {
            accept: "image/*",
            run: () => {
              throw new Error("boom");
            },
          },
        },
        { owner: "good", files: { accept: "video/*", run: goodRun } },
      ],
      breaker
    ) as SlateEditor;

    const video = new File(["x"], "v.mp4", { type: "video/mp4" });
    await (wrapped as any).insertData(fakeTransfer([imageFile(), video]));

    expect((breaker as any).recorded).toEqual([{ owner: "bad", phase: "ingest" }]);
    expect(goodRun).toHaveBeenCalledTimes(1);
  });

  it("熔断停用的扩展跳过认领，文件留给后续声明", async () => {
    const breaker = fakeBreaker();
    (breaker as any).disable("bad");
    const recoverRun = vi.fn();
    const editor = createEditor();
    const wrapped = withIngest(
      editor,
      [
        { owner: "bad", files: { accept: "*" } as any },
        { owner: "recover", files: { accept: "image/*", run: recoverRun } },
      ],
      breaker
    ) as SlateEditor & { insertData: (data: DataTransfer) => Promise<void> };

    await wrapped.insertData(fakeTransfer([imageFile()]));
    expect(recoverRun).toHaveBeenCalledTimes(1);
  });
});

describe("文件拖拽的落点（drop 指示线一致）", () => {
  it("目标块之前取块首；之后取下一块首；最后一块之后取文档末尾", () => {
    const editor = createEditor();
    editor.children = [paragraph("一"), paragraph("二")] as any;

    const beforeFirst = resolveFileDropPoint(editor, { path: [0], before: true });
    expect(beforeFirst.path).toEqual([0, 0]);

    const afterFirst = resolveFileDropPoint(editor, { path: [0], before: false });
    expect(afterFirst.path).toEqual([1, 0]);

    const afterLast = resolveFileDropPoint(editor, { path: [1], before: false });
    expect(afterLast).toEqual(Editor.end(editor, []));
  });
});

describe("装配：ingest 声明收集与冲突", () => {
  const audioIngest = defineExtension({
    id: "test.audio-ingest",
    elements: [
      defineElement({
        type: "audio-ingest",
        kind: "block",
        render: () => null,
        ingest: { files: { accept: "audio/*", run: () => {} } },
      }),
    ],
  });

  it("defineElement.ingest 进装配；未声明不进", () => {
    const v2 = defineExtension({
      id: "test.v2-ingest",
      elements: [
        defineElement({
          type: "v2-ingest",
          kind: "block",
          render: () => null,
          ingest: { files: { accept: "image/*", run: () => {} } },
        }),
      ],
    });
    // bare kit：全量 kit 的内置 audio/image 扩展已声明同名 accept，会撞冲突检测
    const kit = createEditorKit({ extensions: [audioIngest, v2] });
    const accepts = kit.assembly.ingestSources.map(source => source.files?.accept);
    expect(accepts).toEqual(expect.arrayContaining(["audio/*", "image/*"]));
  });

  it("相同 accept 重复声明建 kit 即抛错", () => {
    const a = defineExtension({
      id: "test.dup-a",
      elements: [
        defineElement({
          type: "dup-a",
          kind: "block",
          render: () => null,
          ingest: { files: { accept: "image/*", run: () => {} } },
        }),
      ],
    });
    const b = defineExtension({
      id: "test.dup-b",
      elements: [
        defineElement({
          type: "dup-b",
          kind: "block",
          render: () => null,
          ingest: { files: { accept: "image/*", run: () => {} } },
        }),
      ],
    });
    expect(() => createEditorKit({ extensions: [a, b] })).toThrow(/image\/\*/);
  });
});
