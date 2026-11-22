import { defineAssistView } from "@/app/assistViews";
import { PLUGIN_DOCK_ID } from "@/app/pluginDock";
import { PluginPageDock } from "../components/PluginPageDock";

export default defineAssistView({
  id: PLUGIN_DOCK_ID,
  label: "插件页面",
  component: PluginPageDock,
  keepAlive: true,
});
