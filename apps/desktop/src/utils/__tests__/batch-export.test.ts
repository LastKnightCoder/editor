import { Blob as NodeBlob } from "node:buffer";
import {
  Uint8ArrayReader,
  ZipReader,
  configure as configureZip,
} from "@zip.js/zip.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildMarkdownZipBytes,
  type BatchExportTreeNode,
} from "../batch-export";

const createNode = (
  input: Partial<BatchExportTreeNode> &
    Pick<BatchExportTreeNode, "id" | "title" | "exportable">,
): BatchExportTreeNode => ({
  depth: 0,
  content: input.exportable
    ? [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: input.title }],
        },
      ]
    : [],
  children: [],
  ...input,
});

describe("batch export markdown zip", () => {
  beforeAll(() => {
    vi.stubGlobal("Blob", NodeBlob);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("导出未勾选的空内容目录下已选中的后代文档", async () => {
    const tree = [
      createNode({
        id: 1,
        title: "空内容目录",
        exportable: false,
        children: [
          createNode({
            id: 2,
            title: "下级文档",
            exportable: true,
          }),
        ],
      }),
    ];

    const zipBytes = await buildMarkdownZipBytes(tree, new Set([2]));
    configureZip({ useWebWorkers: false });
    const zipReader = new ZipReader(new Uint8ArrayReader(zipBytes));
    const entries = await zipReader.getEntries();
    await zipReader.close();

    expect(entries.map((entry) => entry.filename)).toEqual([
      "空内容目录/下级文档.md",
    ]);
  });
});
