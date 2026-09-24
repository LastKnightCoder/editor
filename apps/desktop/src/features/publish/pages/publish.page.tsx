/**
 * 发布页 page 定义（从设置弹窗抽出的独立页面，D-035）。
 */

import { definePage } from "@/page/definePage";
import { PublishView } from "../views/PublishView";

export default definePage({
  key: "publish",
  match: "single",
  label: "发布",
  status: "new",
  params: {},
  component: PublishView,
});
