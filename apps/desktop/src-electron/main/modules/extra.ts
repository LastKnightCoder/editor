import { ipcMain, shell, dialog } from "electron";
import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import pkg from "../../../package.json";
import { Module } from "../types/module";
import type { EpubExportPayload } from "@/types/epub-export";
import type { PdfExportPayload } from "@/types/pdf-export";
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

    ipcMain.handle("node-fetch", async (_event, url, options) => {
      return await this.nodeFetch(url, options);
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
      },
    );

    ipcMain.handle(
      "export-epub-with-dialog",
      async (_event, payload: EpubExportPayload) => {
        return await exportEpubWithDialog(payload);
      },
    );

    ipcMain.handle(
      "export-pdf-with-dialog",
      async (_event, payload: PdfExportPayload) => {
        return await exportPdfWithDialog(payload);
      },
    );
  }

  nodeFetch(
    url: string,
    options: AxiosRequestConfig & {
      form?: Record<string, string>;
      httpProxy?: string;
      isRaw?: boolean;
      timeoutMs?: number;
      allowHttpErrorStatus?: boolean;
    },
  ) {
    const newOptions = { ...options };
    if (newOptions.form) {
      const formBody = Object.entries(newOptions.form)
        .map(([key, value]) => `${key}=${value}`)
        .join("&");
      newOptions.data = formBody;
      newOptions.method = "POST";
      newOptions.headers = {
        ...(newOptions.headers || {}),
        "Content-Type": "application/x-www-form-urlencoded",
      };
      delete newOptions.form;
    }

    if (typeof newOptions.timeout === "undefined") {
      newOptions.timeout =
        typeof newOptions.timeoutMs === "number" ? newOptions.timeoutMs : 30000;
    }
    if (newOptions.allowHttpErrorStatus) {
      newOptions.validateStatus = () => true;
      delete newOptions.allowHttpErrorStatus;
    }

    // 代理支持（http/https）：如果传入 httpProxy，则注入 agent，并禁用 axios 内置 proxy 选项
    if (newOptions.httpProxy) {
      const agent = new HttpsProxyAgent(newOptions.httpProxy);
      newOptions.httpsAgent = agent;
      newOptions.httpAgent = agent;
      delete newOptions.httpProxy;
      newOptions.proxy = false;
    }

    try {
      const response = axios.request({ url, ...newOptions });
      if (newOptions.isRaw) {
        // 返回可序列化的响应对象（用于 IPC 传输）
        return response.then((res) => ({
          data: res.data,
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
          finalUrl:
            res.request?.res?.responseUrl || res.request?.responseURL || url,
        }));
      }
      return response.then((res) => res.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as any)?.code || (err as any)?.response?.status;
      const details = {
        code,
        message: msg,
        url,
        timeout: newOptions.timeout,
      };
      throw Object.assign(new Error(`nodeFetch failed: ${msg}`), details);
    }
  }

  async downloadFileWithDialog(
    url: string,
    defaultFileName?: string,
  ): Promise<string | null> {
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

      // 使用 nodeFetch 下载文件（绕过 CORS）
      const response = await this.nodeFetch(url, {
        method: "GET",
        responseType: "arraybuffer",
      });

      // 将数据写入文件
      await writeFile(savePath, Buffer.from(response));

      return savePath;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`下载文件失败: ${msg}`);
    }
  }
}

export default new Extra();
