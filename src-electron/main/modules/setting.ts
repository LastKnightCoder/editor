import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import fsExtra from "fs-extra/esm";
import { join } from 'node:path';
import PathUtil from '../utils/PathUtil';
import { Module } from "../types/module";

class SettingModule implements Module {
  name: string;
  constructor() {
    this.name = 'setting';
  }

  async init() {
    ipcMain.handle('read-setting', async () => {
      return this.readSetting();
    });
    ipcMain.handle('write-setting', async (_event, setting) => {
      return this.writeSetting(setting);
    });
  }

  async readSetting() {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, 'setting.json');
    if (!await fsExtra.pathExists(settingPath)) {
      await this.writeSetting('{}');
    }
    return await fs.readFile(settingPath, 'utf-8');
  }

  writeSetting(setting: string) {
    const appDir = PathUtil.getAppDir();
    return fs.writeFile(join(appDir, 'setting.json'), setting, 'utf-8');
  }
}

export default new SettingModule();
