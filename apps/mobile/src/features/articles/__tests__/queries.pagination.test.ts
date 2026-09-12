import { describe, expect, it } from "vitest";
import type { ArticleListResponse } from "../../../types";

function nextOffset(lastPage: ArticleListResponse, allPages: ArticleListResponse[]) {
  const loaded = allPages.reduce((count, page) => count + page.items.length, 0);
  return loaded < lastPage.total ? loaded : undefined;
}

describe("分页游标契约", () => {
  it("未加载完时返回下一页 offset", () => {
    const page = { items: [{ id: 1 }], total: 2 } as ArticleListResponse;
    expect(nextOffset(page, [page])).toBe(1);
  });

  it("加载完成时不再请求下一页", () => {
    const page = { items: [{ id: 1 }], total: 1 } as ArticleListResponse;
    expect(nextOffset(page, [page])).toBeUndefined();
  });
});
