/**
 * 微信读书单本笔记 page：一本书一个实例（按 bookId 去重）。
 * bookmark = 定位到某条划线 / 想法（bookmarkId 或 reviewId，摘录打开到原处用）。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { WeReadBookView } from "../views/WeReadBookView";

const schema = createPageSchema({
  bookId: paramString(),
  bookmark: paramOptional(paramString()),
});

export default definePage({
  key: "weread-book",
  match: "params",
  getId: params => `weread-book-${params.bookId}`,
  label: "微信读书",
  params: schema.schema,
  component: WeReadBookView,
});
