/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { definePage } from "../../../router";
import { string } from "../../../router/core/paramsSchema";
import { PluginPageView } from "../PluginPageView";
export default definePage({
  key: "pluginPage",
  match: "params",
  params: { id: string(), instance: string(), params: string("{}") },
  getId: params => JSON.stringify([params.id, params.instance]),
  component: PluginPageView,
});
