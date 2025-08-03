import { ipcMain, shell } from "electron";
import axios from "axios";
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

  nodeFetch(url: string, options: any) {
    const newOptions = { ...options };
    if (options.form) {
      newOptions.body = Object.entries(options.form)
        .map(([key, value]) => `${key}=${value}`)
        .join("&");
      newOptions.method = "POST";
      newOptions.headers = {
        ...newOptions.headers,
        "Content-Type": "application/x-www-form-urlencoded",
      };
      delete newOptions.form;
    }

    const response = axios.request({
      url,
      ...newOptions,
    });

    if (options.isRaw) {
      return response;
    }

    return response.then((res) => res.data);
  }
}

export default new Extra();
