/**
 * PDF 列表 page：key "pdfs" 与 navigation.ts 一致，真实注册接管侧边栏入口。
 * 来源筛选 / 搜索是页内状态，不进参数（切换不堆后退历史）。
 */

import { definePage } from "@/page/definePage";
import { PdfsView } from "../views/PdfsView";

export default definePage({
  key: "pdfs",
  match: "single",
  label: "PDF",
  params: {},
  component: PdfsView,
});
