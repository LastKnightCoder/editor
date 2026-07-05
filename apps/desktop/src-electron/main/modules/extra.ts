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
  private nodeFetchControllers = new Map<string, AbortController>();
  private abortedNodeFetchRequestIds = new Set<string>();

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

    ipcMain.on(
      "node-fetch:abort",
      (_event, payload: { requestId?: string }) => {
        if (!payload?.requestId) {
          return;
        }
        const controller = this.nodeFetchControllers.get(payload.requestId);
        if (controller) {
          controller.abort();
          return;
        }
        this.abortedNodeFetchRequestIds.add(payload.requestId);
      },
    );

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

  async nodeFetch(
    url: string,
    options: AxiosRequestConfig & {
      form?: Record<string, string>;
      multipart?: {
        fields?: Record<string, string>;
        files?: Array<{
          fieldName: string;
          fileName: string;
          mimeType: string;
          base64: string;
        }>;
      };
      httpProxy?: string;
      isRaw?: boolean;
      timeoutMs?: number;
      allowHttpErrorStatus?: boolean;
      requestId?: string;
    },
  ) {
    const newOptions = { ...options };
    const requestId =
      typeof newOptions.requestId === "string" ? newOptions.requestId : null;
    delete newOptions.requestId;

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
    if (newOptions.multipart) {
      const formData = new FormData();
      Object.entries(newOptions.multipart.fields || {}).forEach(
        ([key, value]) => {
          formData.append(key, value);
        },
      );
      (newOptions.multipart.files || []).forEach((file) => {
        const bytes = Buffer.from(file.base64, "base64");
        const arrayBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        );
        const blob = new Blob([arrayBuffer], { type: file.mimeType });
        formData.append(file.fieldName, blob, file.fileName);
      });
      newOptions.data = formData;
      newOptions.method = newOptions.method || "POST";
      if (newOptions.headers) {
        delete (newOptions.headers as Record<string, unknown>)["Content-Type"];
        delete (newOptions.headers as Record<string, unknown>)["content-type"];
      }
      delete newOptions.multipart;
    }

    if (typeof newOptions.timeout === "undefined") {
      newOptions.timeout =
        typeof newOptions.timeoutMs === "number" ? newOptions.timeoutMs : 30000;
    }
    if (newOptions.allowHttpErrorStatus) {
      newOptions.validateStatus = () => true;
      delete newOptions.allowHttpErrorStatus;
    }

    if (requestId) {
      const controller = new AbortController();
      this.nodeFetchControllers.set(requestId, controller);
      newOptions.signal = controller.signal;
      if (this.abortedNodeFetchRequestIds.has(requestId)) {
        this.abortedNodeFetchRequestIds.delete(requestId);
        controller.abort();
      }
    }

    if (newOptions.httpProxy) {
      const agent = new HttpsProxyAgent(newOptions.httpProxy);
      newOptions.httpsAgent = agent;
      newOptions.httpAgent = agent;
      delete newOptions.httpProxy;
      newOptions.proxy = false;
    }

    try {
      const response = await axios.request({ url, ...newOptions });
      if (newOptions.isRaw) {
        return {
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          finalUrl:
            response.request?.res?.responseUrl ||
            response.request?.responseURL ||
            url,
        };
      }
      return response.data;
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
    } finally {
      if (requestId) {
        this.nodeFetchControllers.delete(requestId);
        this.abortedNodeFetchRequestIds.delete(requestId);
      }
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
