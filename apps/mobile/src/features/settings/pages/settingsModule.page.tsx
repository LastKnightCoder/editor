// 设置模块页定义：module 参数即页面身份（match: "params"）。
// 我的 → 二级模块逐级入栈，返回逐级退栈；滚动保持由 Activity 保活提供。

import { SettingsModulePage } from "../SettingsModulePage";
import { SETTINGS_MODULE_KEYS } from "../components/types";
import { createPageSchema, definePage, paramOneOf, usePage } from "../../../router";

const settingsModuleSchema = createPageSchema({
  module: paramOneOf(...SETTINGS_MODULE_KEYS),
});
type SettingsModuleParams = typeof settingsModuleSchema.type;

function SettingsModuleScreen() {
  const { params } = usePage<SettingsModuleParams>();
  return <SettingsModulePage module={params.module} />;
}

export default definePage({
  key: "settingsModule",
  // 同一模块栈内只保留一份，重复打开 = 移到顶并刷新参数
  match: "params",
  getId: p => p.module,
  params: settingsModuleSchema.schema,
  component: SettingsModuleScreen,
});
