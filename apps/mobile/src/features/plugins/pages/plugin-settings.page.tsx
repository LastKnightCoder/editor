/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { definePage } from "../../../router";
import { string } from "../../../router/core/paramsSchema";
import { PluginSettingsView } from "../PluginPageView";
export default definePage({
  key: "pluginSettings",
  match: "params",
  params: { id: string() },
  getId: params => params.id,
  component: PluginSettingsView,
});
