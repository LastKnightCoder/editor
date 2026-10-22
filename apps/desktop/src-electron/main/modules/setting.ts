import fs from "node:fs/promises";
import fsExtra from "fs-extra/esm";
import { join } from "node:path";
import { settingCommands } from "@tau/contracts";
import PathUtil from "../utils/PathUtil";
import { Module } from "../types/module";

class SettingModule implements Module {
  name: string;
  constructor() {
    this.name = "setting";
  }

  async init() {
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
      await this.writeSetting("{}");
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
