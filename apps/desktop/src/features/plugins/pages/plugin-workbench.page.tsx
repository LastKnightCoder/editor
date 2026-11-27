import { appMessages } from "@/app/i18n/messages";
import { definePage } from "@/page/definePage";
import { PLUGIN_WORKBENCH_KEY } from "@/app/plugins/runtime";
import { PluginWorkbenchView } from "../views/PluginWorkbenchView";

export default import.meta.env.DEV
  ? definePage({
      key: PLUGIN_WORKBENCH_KEY,
      label: appMessages.ref("page.pluginWorkbench"),
      match: "single",
      params: {},
      component: PluginWorkbenchView,
    })
  : undefined;
