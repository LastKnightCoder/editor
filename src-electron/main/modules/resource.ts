import { ipcMain, shell, dialog } from 'electron';
import { basename } from 'node:path';
import { exec } from 'node:child_process';
import { getFonts } from 'font-list';
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

    ipcMain.handle('select-file', async (_, options) => {
      return this.selectFile(options);
    });

    ipcMain.handle('get-file-basename', async (_, filePath: string) => {
      return this.getFileBaseName(filePath);
    });

    ipcMain.handle('get-all-fonts', () => {
      return this.getAllFonts();
    })
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

  selectFile(options = { properties: ['openFile'] }) {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      dialog.showOpenDialog(options).then((result) => {
        if (result.canceled) {
          reject(new Error('User canceled file selection'));
        } else {
          resolve(result.filePaths[0]);
        }
      }).catch((err) => {
        reject(err);
      })
    })
  }

  getFileBaseName(filePath: string) {
    return basename(filePath);
  }

  getAllFonts() {
    return getFonts({
      disableQuoting: true
    });
  }
}

export default new ResourceModule();
