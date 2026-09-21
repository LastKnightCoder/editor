/**
 * 卡片详情 page 定义（mockups/card-detail/plan-a-plain.html v2 定稿落地）。
 * params 按 id 去重——同一张卡重复进入激活同一实例；连接 chip 跳转经栈机
 * 异参原位更新（不弹栈）。
 */

import { createPageSchema, paramNumber } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { CardDetailView } from "../views/CardDetailView";

const schema = createPageSchema({ id: paramNumber() });

export default definePage({
  key: "card-detail",
  match: "params",
  getId: params => `card-${params.id}`,
  label: "卡片详情",
  status: "new",
  params: schema.schema,
  component: CardDetailView,
});
