/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { definePage, paramNumber } from "../../../router";
import { PluginFlashcardCreate } from "../PluginFlashcardCreate";

export default definePage({
  key: "pluginFlashcardCreate",
  match: "params",
  params: { requestId: paramNumber() },
  getId: params => String(params.requestId),
  component: PluginFlashcardCreate,
});
