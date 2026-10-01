/**
 * 文章详情 page 定义（占位版：编辑器迁移前承接列表页的页内跳转，
 * 见 DECISIONS.md D-015 追记）。params 按 id 去重——同篇文章重复进入激活同一实例。
 */

import { createPageSchema, paramNumber } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ArticleDetailView } from "../views/ArticleDetailView";

const schema = createPageSchema({ id: paramNumber() });

export default definePage({
  key: "article-detail",
  match: "params",
  getId: params => `article-${params.id}`,
  label: "文章详情",
  params: schema.schema,
  component: ArticleDetailView,
});
