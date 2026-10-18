import { ipcMain } from "electron";
import { createClient } from "webdav";
import { Module } from "../types/module";

interface IWebDavUpload {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  file: Uint8Array;
  contentType?: string;
}

interface IWebDavDownload {
  url: string;
  username: string;
  password: string;
  remotePath: string;
}

class WebDavModule implements Module {
  name: string;

  constructor() {
    this.name = "webdav";
  }

  async init() {
    ipcMain.handle("webdav-upload", async (_event, uploadInfo: IWebDavUpload) => {
      return await this.upload(uploadInfo);
    });

    ipcMain.handle("webdav-download", async (_event, downloadInfo: IWebDavDownload) => {
      return await this.download(downloadInfo);
    });
  }

  async upload(uploadInfo: IWebDavUpload): Promise<string> {
    const { url, username, password, remotePath, file } = uploadInfo;

    try {
      const client = createClient(url, {
        username,
        password,
      });

      // 确保目录存在
      const pathParts = remotePath.split("/").filter(Boolean);
      if (pathParts.length > 1) {
        const dirPath = "/" + pathParts.slice(0, -1).join("/");
        try {
          await client.createDirectory(dirPath, { recursive: true });
        } catch (e) {
          // 目录可能已存在，忽略错误
          console.log("目录已存在或创建失败:", e);
        }
      }

      // 上传文件
      const buffer = Buffer.from(file);
      await client.putFileContents(remotePath, buffer, {
        contentLength: buffer.byteLength,
        overwrite: true,
      });

      // 构建文件 URL
      const baseUrl = url.replace(/\/$/, "");
      return `${baseUrl}${remotePath}`;
    } catch (error) {
      console.error("WebDAV 上传失败:", error);
      throw error;
    }
  }

  async download(downloadInfo: IWebDavDownload): Promise<Uint8Array> {
    const { url, username, password, remotePath } = downloadInfo;

    try {
      const client = createClient(url, {
        username,
        password,
      });

      // 下载文件
      const content = await client.getFileContents(remotePath);

      // 将 Buffer 或 BufferLike 转换为 Uint8Array
      if (content instanceof ArrayBuffer) {
        return new Uint8Array(content);
      } else if (Buffer.isBuffer(content)) {
        return new Uint8Array(content);
      } else if (typeof content === "string") {
        // 如果是字符串，转换为 Uint8Array
        return new Uint8Array(Buffer.from(content));
      } else {
        throw new Error("Unexpected content type");
      }
    } catch (error) {
      console.error("WebDAV 下载失败:", error);
      throw error;
    }
  }
}

export default new WebDavModule();
