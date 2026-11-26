import { pluginControlsMessages } from "../controls.i18n";
import { definePage } from "@/page/definePage";
import { paramString } from "@/page/core/paramsSchema";
import { PLUGIN_PAGE_KEY } from "@/app/plugins/runtime";
import { PluginPageView } from "../views/PluginPageView";

const pluginPage = definePage({
  key: PLUGIN_PAGE_KEY,
  label: pluginControlsMessages.ref("page.label"),
  match: "params",
  getId: params => JSON.stringify([params.pluginId, params.pageId, params.instanceId]),
  params: {
    pluginId: paramString(),
    pageId: paramString(),
    instanceId: paramString(),
    params: paramString(),
  },
  component: PluginPageView,
});

export default pluginPage;
