import { afterEach, expect, it, vi } from "vitest";
import type { Pdf } from "@/types";
import { getPdfPageCount, loadPdfPage } from "../pdfPage";

const { readFile, beforeRender } = vi.hoisted(() => ({
  readFile: vi.fn(async () => Uint8Array.of(8)),
  beforeRender: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/commands", () => ({ readBinaryFile: readFile }));
vi.mock("../queries", () => ({ resolvePdfPath: async (pdf: Pdf) => pdf.filePath }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: ({ data }: { data: Uint8Array }) => {
    let destroyed = false;
    return {
      promise: Promise.resolve({
        numPages: data[0],
        destroy: () => {
          destroyed = true;
        },
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 100 * scale,
            height: 100 * scale,
          }),
          render: () => ({
            promise: beforeRender().then(() => {
              if (destroyed) throw new Error("PDF 在页面绘制完成前已关闭");
            }),
          }),
          cleanup: vi.fn(),
        }),
      }),
    };
  },
}));

const pdfFile = (id: number): Pdf => ({
  id,
  updateTime: 1,
  createTime: 1,
  filePath: `/${id}.pdf`,
  fileName: `${id}.pdf`,
  isLocal: true,
  tags: [],
  category: "",
  remoteUrl: "",
});

function installCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback =>
    callback(new Blob())
  );
}

afterEach(() => vi.restoreAllMocks());

it("其他文档被打开时，在途页面仍能完成绘制", async () => {
  installCanvas();
  let finish!: () => void;
  let started!: () => void;
  const rendering = new Promise<void>(resolve => {
    started = resolve;
  });
  beforeRender.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
        started();
      })
  );
  const page = loadPdfPage("concurrent", pdfFile(1), 3, 320);
  await rendering;
  try {
    for (let id = 2; id <= 9; id++) await getPdfPageCount("concurrent", pdfFile(id));
  } finally {
    finish();
  }
  expect((await page).page).toBe(3);
});

it("两个库同号同时间的 PDF 各自按真实文件的末页取图", async () => {
  installCanvas();
  const pdf = pdfFile(20);
  readFile.mockResolvedValueOnce(Uint8Array.of(2)).mockResolvedValueOnce(Uint8Array.of(5));
  const first = await loadPdfPage("first", pdf, 7, 320);
  const second = await loadPdfPage("second", pdf, 7, 320);
  expect([first.page, second.page]).toEqual([2, 5]);
});
