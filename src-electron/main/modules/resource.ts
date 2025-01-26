import { ipcMain, shell } from 'electron';
import { exec } from 'node:child_process';
import PathUtil from '../utils/PathUtil';
import { Module } from '../types/module';

class ResourceModule implements Module {
  name = 'resource';

  async init() {
    ipcMain.handle('get-home-dir', async () => {
      return PathUtil.getHomeDir();
    });

    ipcMain.handle('get-app-dir', async () => {
      return PathUtil.getAppDir();
    });

    ipcMain.handle('show-in-folder', async (_, path) => {
      this.showInFolder(path);
    });
  }

  showInFolder(path: string) {
    shell.openPath(path);
    if (process.platform === 'darwin') {
      exec(`open -R ${path}`);
    } else if (process.platform === 'win32') {
      exec(`explorer /select,${path}`);
    } else {
      exec(`xdg-open ${path}`);
    }
  }
}

export default new ResourceModule();
