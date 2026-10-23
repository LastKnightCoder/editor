import { afterEach, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";
import { createContentLengthCounter } from "../contentLength";

vi.mock("@/utils/helper", async importOriginal => {
  const actual = await importOriginal<typeof import("@/utils/helper")>();
  return { ...actual, getContentLength: vi.fn(actual.getContentLength) };
});
afterEach(() => vi.clearAllMocks());

it("未变块复用字数，局部更新、移除与撤销仍符合共享统计口径", () => {
  const paragraph = (text: string): Descendant => ({
    type: "paragraph",
    children: [{ type: "formatted", text }],
  });
  const first = paragraph("中文正文");
  const second = paragraph("hello world");
  const count = createContentLengthCounter();
  expect(count([first, second])).toBe(6);
  expect(getContentLength).toHaveBeenCalledTimes(2);
  expect(count([second, first])).toBe(6);
  expect(getContentLength).toHaveBeenCalledTimes(2);
  const updated = paragraph("中文正文新增");
  expect(count([updated, second])).toBe(8);
  expect(getContentLength).toHaveBeenCalledTimes(3);
  expect(count([second])).toBe(2);
  expect(count([first, second])).toBe(6);
  expect(getContentLength).toHaveBeenCalledTimes(3);
});
