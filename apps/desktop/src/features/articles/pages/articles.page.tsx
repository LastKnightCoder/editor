/**
 * 文章 page 定义。
 */

import { definePage } from "@/page/definePage";
import { ArticlesView } from "../views/ArticlesView";

export default definePage({
  key: "articles",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "文章",
  status: "new",
  params: {},
  component: ArticlesView,
});
