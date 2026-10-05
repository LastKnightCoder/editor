import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMaterial, openMaterialTarget } from "../open-material";

const mocks = vi.hoisted(() => ({
  openPage: vi.fn(),
  openEntity: vi.fn(),
  openExternal: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("../page-navigation", () => ({ openPage: mocks.openPage }));
vi.mock("../open-content", () => ({ openEntity: mocks.openEntity }));
vi.mock("@/commands/extra", () => ({ openExternal: mocks.openExternal }));
vi.mock("@/electron", () => ({ invoke: mocks.invoke }));

beforeEach(() => vi.clearAllMocks());

describe("外部材料打开到原处", () => {
  it("微信读书定位到划线、PDF 定位到标注、网页走浏览器、剪藏打开网页条目", async () => {
    await openMaterialTarget({ page: "weread-book", bookId: "b1", bookmark: "bm" });
    expect(mocks.openPage).toHaveBeenLastCalledWith("weread-book", {
      bookId: "b1",
      bookmark: "bm",
    });
    await openMaterialTarget({ page: "weread-book", bookId: "b1" });
    expect(mocks.openPage).toHaveBeenLastCalledWith("weread-book", { bookId: "b1" });
    await openMaterialTarget({ page: "pdf-detail", pdfId: 2, annotationId: 5 });
    expect(mocks.openPage).toHaveBeenLastCalledWith("pdf-detail", { pdfId: 2, annotation: 5 });
    await openMaterialTarget({ page: "external-url", url: "https://a.com#tau-hl=u" });
    expect(mocks.openExternal).toHaveBeenCalledWith("https://a.com#tau-hl=u");
    await openMaterialTarget({ page: "project-web-clip", itemId: 9 });
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "project-item", id: 9 });
  });

  it("按地址打开：已删除或不可定位时报错", async () => {
    mocks.invoke.mockResolvedValueOnce([]);
    await expect(openMaterial({ kind: "excerpt", id: 1 })).rejects.toThrow("材料已删除");
    mocks.invoke.mockResolvedValueOnce([{ deleted: true, open: null }]);
    await expect(openMaterial({ kind: "excerpt", id: 1 })).rejects.toThrow("原划线已删除");
  });
});
