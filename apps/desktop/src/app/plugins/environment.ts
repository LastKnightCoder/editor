import { createBrowserPluginEnvironment } from "@tau/plugins/environment-host";

export const desktopPluginEnvironment = createBrowserPluginEnvironment(
  "desktop",
  [
    "commands.v1",
    "storage.v1",
    "pages.v1",
    "navigation.v1",
    "settings.v1",
    "ui.dialog.v1",
    "editor.elements.v1",
    "editor.codecs.v1",
    "editor.source.v1",
  ],
  window
);
