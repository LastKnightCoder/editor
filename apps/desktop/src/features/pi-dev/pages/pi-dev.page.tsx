/**
 * pi 会话开发面板 page 定义（pi 迁移 M2 端到端验证）。
 */

import { definePage } from "@/page/definePage";
import { PiDevView } from "../views/PiDevView";

export default definePage({
  key: "pi-dev",
  match: "single",
  label: "pi 会话（开发）",
  status: "new",
  params: {},
  component: PiDevView,
});
