import { definePage } from "@/page/definePage";
import { PLUGIN_WORKBENCH_KEY } from "@/app/plugins/runtime";
import { PluginWorkbenchView } from "../views/PluginWorkbenchView";

export default import.meta.env.DEV
  ? definePage({
      key: PLUGIN_WORKBENCH_KEY,
      label: "插件开发台",
      match: "single",
      params: {},
      component: PluginWorkbenchView,
    })
  : undefined;
