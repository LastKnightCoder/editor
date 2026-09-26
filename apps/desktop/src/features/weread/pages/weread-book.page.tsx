/** 微信读书单本笔记 page：一本书一个实例（按 bookId 去重）。 */

import { createPageSchema, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { WeReadBookView } from "../views/WeReadBookView";

const schema = createPageSchema({
  bookId: paramString(),
});

export default definePage({
  key: "weread-book",
  match: "params",
  getId: params => `weread-book-${params.bookId}`,
  label: "微信读书",
  status: "new",
  params: schema.schema,
  component: WeReadBookView,
});
