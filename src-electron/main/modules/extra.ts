import { ipcMain, shell } from "electron";
import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { resolve } from "node:path";
import pkg from "../../../package.json";
import { Module } from "../types/module";

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
  }

  nodeFetch(
    url: string,
    options: AxiosRequestConfig & {
      form?: Record<string, string>;
      httpProxy?: string;
      isRaw?: boolean;
      timeoutMs?: number;
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
        return response;
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
}

export default new Extra();
