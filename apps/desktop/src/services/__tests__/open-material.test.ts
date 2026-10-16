import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMaterial, openMaterialTarget } from "../open-material";
import { registerExcerptOpener } from "../excerpt-providers";

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
  it("摘录交给提供方、PDF 定位到标注、网页走浏览器、剪藏打开网页条目", async () => {
    const opened: unknown[] = [];
    const target = {
      page: "excerpt-provider" as const,
      sourceType: "weread",
      sourceKey: "b1",
      externalId: "b1:bm",
      label: "微信读书",
      url: "https://weread.qq.com/web/reader/x",
    };
    const unregister = registerExcerptOpener("weread", value => void opened.push(value));
    await openMaterialTarget(target);
    expect(opened).toEqual([{ sourceKey: "b1", externalId: "b1:bm" }]);
    expect(mocks.openExternal).not.toHaveBeenCalled();
    unregister();
    await openMaterialTarget(target);
    expect(mocks.openExternal).toHaveBeenLastCalledWith("https://weread.qq.com/web/reader/x");
    await expect(openMaterialTarget({ ...target, url: null })).rejects.toThrow(
      "需启用「微信读书」插件"
    );
    await openMaterialTarget({ page: "pdf-detail", pdfId: 2, annotationId: 5 });
    expect(mocks.openPage).toHaveBeenLastCalledWith("pdf-detail", { pdfId: 2, annotation: 5 });
    await openMaterialTarget({ page: "external-url", url: "https://a.com#tau-hl=u" });
    expect(mocks.openExternal).toHaveBeenCalledWith("https://a.com#tau-hl=u");
    await openMaterialTarget({ page: "project-web-clip", itemId: 9 });
    expect(mocks.openEntity).toHaveBeenCalledWith({ kind: "project-item", id: 9 });
  });

  it("同一来源只允许一个打开方式，注销只移除自己的登记", () => {
    const first = registerExcerptOpener("x", () => undefined);
    expect(() => registerExcerptOpener("x", () => undefined)).toThrow("已有打开方式");
    first();
    const second = registerExcerptOpener("x", () => undefined);
    first();
    expect(() => registerExcerptOpener("x", () => undefined)).toThrow("已有打开方式");
    second();
  });

  it("按地址打开：已删除或不可定位时报错", async () => {
    mocks.invoke.mockResolvedValueOnce([]);
    await expect(openMaterial({ kind: "excerpt", id: 1 })).rejects.toThrow("材料已删除");
    mocks.invoke.mockResolvedValueOnce([{ deleted: true, open: null }]);
    await expect(openMaterial({ kind: "excerpt", id: 1 })).rejects.toThrow("原划线已删除");
  });
});
