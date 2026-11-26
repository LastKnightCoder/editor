import { pluginControlsTranslator } from "../controls.i18n";
import { defineAssistView } from "@/app/assistViews";
import { PLUGIN_DOCK_ID } from "@/app/pluginDock";
import { PluginPageDock } from "../components/PluginPageDock";

export default defineAssistView({
  id: PLUGIN_DOCK_ID,
  get label() {
    return pluginControlsTranslator.t("page.label");
  },
  component: PluginPageDock,
  keepAlive: true,
});
