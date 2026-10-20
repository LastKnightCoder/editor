/** 插件打开宿主界面必须来自当前用户操作。 */
export function assertPluginUserActivation() {
  if (!navigator.userActivation?.isActive) throw new Error("只能在用户点击或按键后调用");
}
