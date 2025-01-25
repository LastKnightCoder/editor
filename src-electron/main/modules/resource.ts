import { ipcMain } from 'electron';
import PathUtil from '../utils/PathUtil';
import { Module } from '../types/module';

class ResourceModule implements Module {
  name = 'resource';

  async init() {
    ipcMain.handle('resource|get_home_dir', async () => {
      return PathUtil.getHomeDir();
    });
  }
}

export default new ResourceModule();
