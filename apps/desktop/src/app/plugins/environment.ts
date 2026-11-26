import { createBrowserPluginEnvironment } from "@tau/plugins/environment-host";

import { desktopLocaleSource } from "../i18n/runtime";

export const desktopPluginEnvironment = createBrowserPluginEnvironment(
  "desktop",
  window,
  desktopLocaleSource
);
