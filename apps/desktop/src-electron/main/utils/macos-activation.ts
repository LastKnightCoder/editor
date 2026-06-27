import type { App } from "electron";
import log from "electron-log";

type MacOSApp = App & {
  setActivationPolicy?: (
    policy: "regular" | "accessory" | "prohibited",
  ) => boolean;
};

export const ensureMacOSForegroundApplication = (app: App) => {
  if (process.platform !== "darwin") {
    return;
  }

  const macApp = app as MacOSApp;

  try {
    macApp.setActivationPolicy?.("regular");
    app.dock?.show();
  } catch (error) {
    log.warn("恢复 macOS 前台应用状态失败", error);
  }
};
