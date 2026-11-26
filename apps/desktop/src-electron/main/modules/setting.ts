import { BrowserWindow, type WebContents } from "electron";
import fs from "node:fs/promises";
import fsExtra from "fs-extra/esm";
import { join } from "node:path";
import { settingCommands } from "@tau/contracts";
import { backgroundPreferenceCommands } from "@/commands/contracts/background-preferences";
import {
  backgroundPreferencesSnapshot,
  updateBackgroundPreferences,
} from "../services/background-preferences";
import PathUtil from "../utils/PathUtil";
import { NEW_USER_SETTING } from "../../../shared/new-user-setting";
import { Module } from "../types/module";

class SettingModule implements Module {
  name: string;
  constructor() {
    this.name = "setting";
  }

  async init() {
    backgroundPreferenceCommands.read.register(() => backgroundPreferencesSnapshot());
    backgroundPreferenceCommands.update.register((event, patch) => {
      const sender = event.sender as WebContents;
      const window = BrowserWindow.fromWebContents(sender);
      if (!window || event.senderFrame !== sender.mainFrame) throw new Error("后台调用窗口无效");
      if (!window.isFocused()) throw new Error("请在前台设置页更改后台运行设置");
      return updateBackgroundPreferences(patch);
    });
    settingCommands.read.register(async () => {
      return this.readSetting();
    });
    settingCommands.write.register(async (_event, setting) => {
      return this.writeSetting(setting);
    });
  }

  async readSetting() {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, "setting.json");
    if (!(await fsExtra.pathExists(settingPath))) {
      await this.writeSetting(JSON.stringify(NEW_USER_SETTING));
    }
    return await fs.readFile(settingPath, "utf-8");
  }

  writeSetting(setting: string) {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, "setting.json");
    const tempPath = join(appDir, "setting.json.tmp");
    return fs
      .writeFile(tempPath, setting, "utf-8")
      .then(() => fsExtra.move(tempPath, settingPath, { overwrite: true }));
  }
}

export default new SettingModule();
