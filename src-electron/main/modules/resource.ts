import { ipcMain, dialog } from "electron";
import { basename, parse, extname, join } from "node:path";
import { exec } from "node:child_process";
import { getFonts } from "font-list";
import { promises as fs } from "node:fs";
import PathUtil from "../utils/PathUtil";
import { Module } from "../types/module";
import crypto from "node:crypto";
import sharp from "sharp";

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

    ipcMain.handle("generate-cache-key", async (_, url: string) => {
      return this.generateCacheKey(url);
    });

    // PDF缓存相关方法
    ipcMain.handle(
      "write-cache-file",
      async (_, filePath: string, data: any) => {
        return this.writeCacheFile(filePath, data);
      },
    );

    ipcMain.handle("read-cache-file", async (_, filePath: string) => {
      return this.readCacheFile(filePath);
    });

    ipcMain.handle("cache-file-exists", async (_, filePath: string) => {
      return this.cacheFileExists(filePath);
    });

    ipcMain.handle("delete-cache-file", async (_, filePath: string) => {
      return this.deleteCacheFile(filePath);
    });

    ipcMain.handle(
      "compress-image",
      async (_, buffer: Uint8Array, mimeType: string) => {
        return this.compressImage(Buffer.from(buffer), mimeType);
      },
    );
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

  generateCacheKey(url: string) {
    return crypto.createHash("md5").update(url).digest("hex");
  }

  // 获取缓存目录路径
  private getCacheDir() {
    return join(PathUtil.getAppDir(), "cache");
  }

  // 确保缓存目录存在
  private async ensureCacheDir() {
    const cacheDir = this.getCacheDir();
    try {
      await fs.access(cacheDir);
    } catch {
      await fs.mkdir(cacheDir, { recursive: true });
    }
    return cacheDir;
  }

  // 写入缓存文件
  async writeCacheFile(filePath: string, data: any): Promise<void> {
    try {
      const cacheDir = await this.ensureCacheDir();
      const fullPath = join(cacheDir, filePath);

      // 确保父目录存在
      const parentDir = join(fullPath, "..");
      await fs.mkdir(parentDir, { recursive: true });

      await fs.writeFile(fullPath, JSON.stringify(data), "utf-8");
    } catch (error) {
      console.error("写入缓存文件失败:", error);
      throw error;
    }
  }

  // 读取缓存文件
  async readCacheFile(filePath: string): Promise<any | null> {
    try {
      const cacheDir = this.getCacheDir();
      const fullPath = join(cacheDir, filePath);
      const data = await fs.readFile(fullPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // 文件不存在或读取失败
      return null;
    }
  }

  // 检查缓存文件是否存在
  async cacheFileExists(filePath: string): Promise<boolean> {
    try {
      const cacheDir = this.getCacheDir();
      const fullPath = join(cacheDir, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  // 删除缓存文件
  async deleteCacheFile(filePath: string): Promise<void> {
    try {
      const cacheDir = this.getCacheDir();
      const fullPath = join(cacheDir, filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      // 文件不存在或删除失败，忽略错误
      console.warn("删除缓存文件失败:", error);
    }
  }

  // 压缩图片
  async compressImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    try {
      // 检查是否是支持的图片格式
      const supportedTypes = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];

      if (!supportedTypes.includes(mimeType.toLowerCase())) {
        return buffer;
      }

      // 使用 sharp 压缩图片为 webp 格式
      const compressedBuffer = await sharp(buffer)
        .webp({ quality: 80 })
        .toBuffer();

      return compressedBuffer;
    } catch (error) {
      console.error("图片压缩失败:", error);
      // 压缩失败时返回原始 buffer
      return buffer;
    }
  }
}

export default new ResourceModule();
