/**
 * 待办 page 定义：key "todos" 与 navigation.ts 一致，真实注册自动接管侧边栏入口
 * （legacy.tsx 的占位注册同步删除）。独立页，不并入日程（D-040）。
 * id = 项目筛选（侧栏子项，项目 id 字符串，空 = 全部），切换经栈机原位更新参数，不堆历史；
 * 主入口 / 首页不带参进入时沿用现有筛选（栈机无参激活语义）。
 * selectedId = 外部定位到某条任务（今日页待办卡等入口），进入后选中并打开详情，参数随即消费掉。
 */

import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { TodosView } from "../views/TodosView";

const schema = createPageSchema({
  id: paramOptional(paramString()),
  selectedId: paramOptional(paramNumber()),
});

export default definePage({
  key: "todos",
  match: "single",
  label: "待办",
  params: schema.schema,
  component: TodosView,
});
