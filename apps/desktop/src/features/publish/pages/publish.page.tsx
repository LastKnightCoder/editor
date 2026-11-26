import { appMessages } from "@/app/i18n/messages";
/**
 * 发布页 page 定义（从设置弹窗抽出的独立页面）。
 */

import { definePage } from "@/page/definePage";
import { PublishView } from "../views/PublishView";

export default definePage({
  key: "publish",
  match: "single",
  label: appMessages.ref("nav.publish"),
  params: {},
  component: PublishView,
});
