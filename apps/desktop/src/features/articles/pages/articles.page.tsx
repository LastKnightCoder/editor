/**
 * 文章 page 定义。
 * id = 标签筛选（侧栏子项，标签名，空 = 全部），切换经栈机原位更新参数，不堆历史。
 */

import { createPageSchema, paramOptional, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { ArticlesView } from "../views/ArticlesView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
});

export default definePage({
  key: "articles",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "文章",
  status: "new",
  params: schema.schema,
  component: ArticlesView,
});
