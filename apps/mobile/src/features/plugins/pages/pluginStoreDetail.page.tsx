/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { definePage } from "../../../router";
import { string } from "../../../router/core/paramsSchema";
import { PluginStoreDetail } from "../PluginStoreDetail";
export default definePage({
  key: "pluginStoreDetail",
  match: "params",
  params: { pluginId: string() },
  getId: params => params.pluginId,
  component: PluginStoreDetail,
});
