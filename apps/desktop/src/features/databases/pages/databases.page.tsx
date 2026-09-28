/**
 * 数据库列表 page：key "databases" 与 navigation.ts 一致，注册后接管侧边栏入口。
 */

import { createPageSchema } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { DatabasesView } from "../views/DatabasesView";

const schema = createPageSchema({});

export default definePage({
  key: "databases",
  match: "single", // 列表页全局一份，重复进入原位激活
  label: "数据库",
  status: "new",
  params: schema.schema,
  component: DatabasesView,
});
