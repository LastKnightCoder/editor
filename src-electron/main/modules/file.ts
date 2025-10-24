import { ipcMain } from "electron";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { ensureDir, pathExists, remove } from "fs-extra/esm";
import { sep, dirname, join } from "node:path";
import { Module } from "../types/module";

class File implements Module {
  name: string;
  constructor() {
    this.name = "file";
  }

  async init() {
    ipcMain.handle("read-binary-file", async (_event, filePath) => {
      return await this.readBinaryFile(filePath);
    });
    ipcMain.handle("write-binary-file", async (_event, filePath, content) => {
      return await this.writeBinaryFile(filePath, content);
    });
    ipcMain.handle("read-text-file", async (_event, filePath) => {
      return await this.readTextFile(filePath);
    });
    ipcMain.handle("write-text-file", async (_event, filePath, content) => {
      return await this.writeTextFile(filePath, content);
    });
    ipcMain.handle("create-dir", async (_event, dirPath) => {
      return await this.createDir(dirPath);
    });
    ipcMain.handle("path-exists", async (_event, path) => {
      return await this.pathExists(path);
    });
    ipcMain.handle("get-sep", () => {
      return this.getSep();
    });
    ipcMain.handle("remove-file", async (_event, path) => {
      return remove(path);
    });
    ipcMain.handle("read-directory", async (_event, dirPath) => {
      return await this.readDirectory(dirPath);
    });
    ipcMain.handle("get-directory-name", async (_event, filePath) => {
      return this.getDirectoryName(filePath);
    });
    ipcMain.handle("is-directory", async (_event, path) => {
      return await this.isDirectory(path);
    });
  }

  async readBinaryFile(filePath: string): Promise<Uint8Array> {
    return await readFile(filePath);
  }

  async writeBinaryFile(filePath: string, contents: Uint8Array): Promise<void> {
    return await writeFile(filePath, contents);
  }

  async readTextFile(filePath: string): Promise<string> {
    return await readFile(filePath, { encoding: "utf-8" });
  }

  async writeTextFile(filePath: string, contents: string): Promise<void> {
    return await writeFile(filePath, contents, { encoding: "utf-8" });
  }

  async createDir(dirPath: string): Promise<void> {
    return await ensureDir(dirPath);
  }

  async pathExists(path: string): Promise<boolean> {
    return await pathExists(path);
  }

  async getSep(): Promise<string> {
    return sep;
  }

  async readDirectory(
    dirPath: string,
  ): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
    }));
  }

  getDirectoryName(filePath: string): string {
    return dirname(filePath);
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

export default new File();
