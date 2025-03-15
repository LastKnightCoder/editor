import { ipcMain, dialog } from "electron";
import { basename, parse, extname } from "node:path";
import { exec } from "node:child_process";
import { getFonts } from "font-list";
import PathUtil from "../utils/PathUtil";
import { Module } from "../types/module";

class ResourceModule implements Module {
  name = "resource";

  async init() {
    ipcMain.handle("get-home-dir", async () => {
      return PathUtil.getHomeDir();
    });

    ipcMain.handle("get-app-dir", async () => {
      return PathUtil.getAppDir();
    });

    ipcMain.handle("show-in-folder", async (_, path) => {
      this.showInFolder(path);
    });

    ipcMain.handle("select-file", async (_, options) => {
      return this.selectFile(options);
    });

    ipcMain.handle(
      "get-file-basename",
      async (_, filePath: string, noExtension?: boolean) => {
        return this.getFileBaseName(filePath, noExtension);
      },
    );

    ipcMain.handle("get-file-extension", async (_, filePath: string) => {
      return extname(filePath);
    });

    ipcMain.handle("get-all-fonts", () => {
      return this.getAllFonts();
    });
  }

  showInFolder(path: string) {
    // shell.openPath(path);
    if (process.platform === "darwin") {
      exec(`open -R ${path}`);
    } else if (process.platform === "win32") {
      exec(`explorer /select,${path}`);
    } else {
      exec(`xdg-open ${path}`);
    }
  }

  selectFile(options = { properties: ["openFile"] }): Promise<string[] | null> {
    return new Promise((resolve, reject) => {
      dialog
        // @ts-ignore
        .showOpenDialog(options)
        .then((result) => {
          if (result.canceled) {
            reject(new Error("User canceled file selection"));
          } else {
            resolve(result.filePaths);
          }
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  getFileBaseName(filePath: string, noExtension?: boolean) {
    if (noExtension) {
      return parse(filePath).name;
    } else {
      return basename(filePath);
    }
  }

  getAllFonts() {
    return getFonts({
      disableQuoting: true,
    });
  }
}

export default new ResourceModule();
