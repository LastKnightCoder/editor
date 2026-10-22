/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { definePage } from "../../../router";
import { PluginManager } from "../PluginManager";
export default definePage({
  key: "plugins",
  match: "single",
  params: {},
  component: PluginManager,
});
