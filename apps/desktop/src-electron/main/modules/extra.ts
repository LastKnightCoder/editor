import { ipcMain, shell, dialog } from "electron";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import pkg from "../../../package.json";
import { Module } from "../types/module";
import type { EpubExportPayload } from "@/types/epub-export";
import type { PdfExportPayload } from "@/types/pdf-export";
import type { SaveFileWithDialogPayload, SaveFileWithDialogResult } from "@/types/save-file";
import { exportEpubWithDialog } from "./epub-exporter";
import { exportPdfWithDialog } from "./pdf-exporter";

class Extra implements Module {
  name: string;

  constructor() {
    this.name = "extra";
  }
  async init() {
    ipcMain.handle("open-external", async (_event, url) => {
      shell.openExternal(url);
    });

    ipcMain.handle("get-versions", () => {
      return {
        app: pkg.version,
        node: process.versions.node,
        v8: process.versions.v8,
        chrome: process.versions.chrome,
        electron: process.versions.electron,
      };
    });

    ipcMain.handle("resolve-path", (_, path) => {
      return resolve(path);
    });

    ipcMain.handle("select-directory-with-dialog", async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });

    ipcMain.handle(
      "download-file-with-dialog",
      async (_event, url: string, defaultFileName?: string) => {
        return await this.downloadFileWithDialog(url, defaultFileName);
      }
    );

    ipcMain.handle("save-file-with-dialog", async (_event, payload: SaveFileWithDialogPayload) => {
      return await this.saveFileWithDialog(payload);
    });

    ipcMain.handle("export-epub-with-dialog", async (_event, payload: EpubExportPayload) => {
      return await exportEpubWithDialog(payload);
    });

    ipcMain.handle("export-pdf-with-dialog", async (_event, payload: PdfExportPayload) => {
      return await exportPdfWithDialog(payload);
    });
  }

  /**
   * 通用保存：弹保存对话框并把文本/二进制内容写入所选路径
   */
  async saveFileWithDialog(payload: SaveFileWithDialogPayload): Promise<SaveFileWithDialogResult> {
    try {
      const result = await dialog.showSaveDialog({
        title: "保存文件",
        defaultPath: payload.defaultFileName,
        filters: payload.filters || [{ name: "所有文件", extensions: ["*"] }],
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true, filePath: null };
      }

      const data = typeof payload.data === "string" ? payload.data : Buffer.from(payload.data);
      await writeFile(result.filePath, data);

      return { canceled: false, filePath: result.filePath };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`保存文件失败: ${msg}`);
    }
  }

  async downloadFileWithDialog(url: string, defaultFileName?: string): Promise<string | null> {
    try {
      // 从 URL 提取默认文件名
      const urlFileName = url.split("/").pop()?.split("?")[0] || "download";
      const fileName = defaultFileName || urlFileName;

      // 弹出保存对话框
      const result = await dialog.showSaveDialog({
        title: "保存文件",
        defaultPath: fileName,
        filters: [{ name: "所有文件", extensions: ["*"] }],
      });

      // 用户取消了保存
      if (result.canceled || !result.filePath) {
        return null;
      }

      const savePath = result.filePath;

      const response = await fetch(url);
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`下载失败: ${response.status}`);
      }
      await writeFile(savePath, Buffer.from(await response.arrayBuffer()));

      return savePath;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`下载文件失败: ${msg}`);
    }
  }
}

export default new Extra();
