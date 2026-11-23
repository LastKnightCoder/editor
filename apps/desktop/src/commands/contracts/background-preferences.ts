import { command } from "@tau/rpc";

interface BackgroundPreferences {
  openAtLogin: boolean;
  keepBackground: boolean;
  startHidden: boolean;
  loginStatus: string | null;
  trayAvailable: boolean;
}

export type BackgroundPreferencesPatch = Partial<
  Pick<BackgroundPreferences, "openAtLogin" | "keepBackground" | "startHidden">
>;

export const backgroundPreferenceCommands = {
  read: command<[], BackgroundPreferences>("setting:read-background-preferences"),
  update: command<[BackgroundPreferencesPatch], BackgroundPreferences>(
    "setting:update-background-preferences"
  ),
};
