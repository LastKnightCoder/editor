import { createBrowserPluginEnvironment } from "@tau/plugins/environment-host";
import { DESKTOP_PLUGIN_CAPABILITIES } from "../../../shared/plugin-package";

export const desktopPluginEnvironment = createBrowserPluginEnvironment(
  "desktop",
  DESKTOP_PLUGIN_CAPABILITIES,
  window
);
