import { pluginControlsMessages } from "../controls.i18n";
import { definePage } from "@/page/definePage";
import { PLUGIN_WORKBENCH_KEY } from "@/app/plugins/runtime";
import { PluginWorkbenchView } from "../views/PluginWorkbenchView";

export default import.meta.env.DEV
  ? definePage({
      key: PLUGIN_WORKBENCH_KEY,
      label: pluginControlsMessages.ref("workbench.title"),
      match: "single",
      params: {},
      component: PluginWorkbenchView,
    })
  : undefined;
