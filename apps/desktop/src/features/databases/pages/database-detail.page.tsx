/**
 * 数据库详情 page：params 按 id 去重——同一数据库重复进入激活同一实例。
 */

import { createPageSchema, paramNumber } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import DatabaseDetailView from "../views/DatabaseDetailView";

const schema = createPageSchema({
  id: paramNumber(),
});

export default definePage({
  key: "database-detail",
  match: "params",
  getId: params => `database-${params.id}`,
  label: "数据库详情",
  params: schema.schema,
  component: DatabaseDetailView,
});
