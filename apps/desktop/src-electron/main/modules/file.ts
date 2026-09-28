import { ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import { constants as fsConstants, watch, type FSWatcher } from "node:fs";
import { copyFile, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { ensureDir, pathExists, remove } from "fs-extra/esm";
import { sep, dirname, join, resolve } from "node:path";
import { Module } from "../types/module";

interface FileWatcherRegistration {
  filePath: string;
  senderId: number;
  watcher: FSWatcher;
  restartTimer: ReturnType<typeof setTimeout> | null;
}

interface DirectoryWatcherRegistration {
  directoryPath: string;
  senderId: number;
  watcher: FSWatcher;
}

class File implements Module {
  name: string;
  private watcherRegistrations = new Map<string, FileWatcherRegistration>();
  private senderWatchKeys = new Map<number, Set<string>>();
  private senderCleanupRegistered = new Set<number>();
  private directoryWatcherRegistrations = new Map<string, DirectoryWatcherRegistration>();

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
    ipcMain.handle("create-text-file-exclusive", async (_event, filePath, content) => {
      return await this.createTextFileExclusive(filePath, content);
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
    // 移到废纸篓（可恢复），文件树删除走这条
    ipcMain.handle("trash-item", async (_event, path: string) => {
      return shell.trashItem(path);
    });
    ipcMain.handle("rename-file-or-directory", async (_event, oldPath, newPath) => {
      return await this.renameFileOrDirectory(oldPath, newPath);
    });
    ipcMain.handle("read-directory", async (_event, dirPath) => {
      return await this.readDirectory(dirPath);
    });
    ipcMain.handle("get-directory-name", async (_event, filePath) => {
      return this.getDirectoryName(filePath);
    });
    ipcMain.handle("resolve-path-from", async (_event, baseDir: string, targetPath: string) => {
      return this.resolvePathFrom(baseDir, targetPath);
    });
    ipcMain.handle("is-directory", async (_event, path) => {
      return await this.isDirectory(path);
    });
    ipcMain.handle("watch-directory", async (event: IpcMainInvokeEvent, directoryPath: string) => {
      return this.watchDirectory(event, directoryPath);
    });
    ipcMain.handle(
      "unwatch-directory",
      async (event: IpcMainInvokeEvent, directoryPath: string) => {
        return this.unwatchDirectory(event.sender.id, directoryPath);
      }
    );
    ipcMain.handle("watch-text-file", async (event: IpcMainInvokeEvent, filePath: string) => {
      return await this.watchTextFile(event, filePath);
    });
    ipcMain.handle("unwatch-text-file", async (event: IpcMainInvokeEvent, filePath: string) => {
      this.unwatchTextFile(event.sender.id, filePath);
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

  async createTextFileExclusive(filePath: string, contents: string): Promise<void> {
    await writeFile(filePath, contents, { encoding: "utf-8", flag: "wx" });
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
    dirPath: string
  ): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      path: join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
    }));
  }

  getDirectoryName(filePath: string): string {
    return dirname(filePath);
  }

  resolvePathFrom(baseDir: string, targetPath: string): string {
    return resolve(baseDir, targetPath);
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async renameFileOrDirectory(oldPath: string, newPath: string): Promise<void> {
    const sourceStats = await stat(oldPath);
    const targetStats = await stat(newPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (sourceStats.isDirectory()) {
      if (targetStats) {
        const conflictError = new Error("目标已存在") as NodeJS.ErrnoException;
        conflictError.code = "EEXIST";
        throw conflictError;
      }
      await rename(oldPath, newPath);
      return;
    }

    if (targetStats && targetStats.dev === sourceStats.dev && targetStats.ino === sourceStats.ino) {
      await rename(oldPath, newPath);
      return;
    }

    await copyFile(oldPath, newPath, fsConstants.COPYFILE_EXCL);
    try {
      await unlink(oldPath);
    } catch (error) {
      await unlink(newPath).catch(() => undefined);
      throw error;
    }
  }

  private getDirectoryWatchKey(senderId: number, directoryPath: string): string {
    return `${senderId}:${directoryPath}`;
  }

  watchDirectory(event: IpcMainInvokeEvent, directoryPath: string): void {
    const sender = event.sender;
    const watchKey = this.getDirectoryWatchKey(sender.id, directoryPath);
    if (this.directoryWatcherRegistrations.has(watchKey)) return;

    this.ensureSenderCleanup(sender);

    let watcher: FSWatcher;
    try {
      watcher = watch(directoryPath, { persistent: false }, () => {
        if (!sender.isDestroyed()) {
          sender.send("directory-changed", { directoryPath });
        }
      });
    } catch {
      return;
    }

    this.directoryWatcherRegistrations.set(watchKey, {
      directoryPath,
      senderId: sender.id,
      watcher,
    });
    watcher.once("error", () => {
      this.disposeDirectoryWatcher(watchKey);
    });
  }

  unwatchDirectory(senderId: number, directoryPath: string): void {
    const watchKey = this.getDirectoryWatchKey(senderId, directoryPath);
    this.disposeDirectoryWatcher(watchKey);
  }

  private getWatchKey(senderId: number, filePath: string): string {
    return `${senderId}:${filePath}`;
  }

  private ensureSenderCleanup(sender: WebContents): void {
    const senderId = sender.id;
    if (this.senderCleanupRegistered.has(senderId)) {
      return;
    }

    this.senderCleanupRegistered.add(senderId);
    sender.once("destroyed", () => {
      this.cleanupSenderWatchers(senderId);
    });
  }

  private trackSenderWatchKey(senderId: number, watchKey: string): void {
    const watchKeys = this.senderWatchKeys.get(senderId) ?? new Set<string>();
    watchKeys.add(watchKey);
    this.senderWatchKeys.set(senderId, watchKeys);
  }

  private cleanupSenderWatchers(senderId: number): void {
    const watchKeys = this.senderWatchKeys.get(senderId);
    if (watchKeys) {
      Array.from(watchKeys).forEach(watchKey => {
        this.disposeWatcher(watchKey);
      });
      this.senderWatchKeys.delete(senderId);
    }

    Array.from(this.directoryWatcherRegistrations.entries()).forEach(([watchKey, registration]) => {
      if (registration.senderId === senderId) {
        this.disposeDirectoryWatcher(watchKey);
      }
    });
    this.senderCleanupRegistered.delete(senderId);
  }

  private disposeDirectoryWatcher(watchKey: string): void {
    const registration = this.directoryWatcherRegistrations.get(watchKey);
    if (!registration) return;

    try {
      registration.watcher.close();
    } catch {
      // watcher 已关闭时无需处理
    }
    this.directoryWatcherRegistrations.delete(watchKey);
  }

  private disposeWatcher(watchKey: string): void {
    const registration = this.watcherRegistrations.get(watchKey);
    if (!registration) {
      return;
    }

    if (registration.restartTimer) {
      clearTimeout(registration.restartTimer);
    }

    try {
      registration.watcher.close();
    } catch {
      // 关闭已释放的 watcher 时无需额外处理
    }

    this.watcherRegistrations.delete(watchKey);

    const senderWatchKeys = this.senderWatchKeys.get(registration.senderId);
    if (!senderWatchKeys) {
      return;
    }

    senderWatchKeys.delete(watchKey);
    if (senderWatchKeys.size === 0) {
      this.senderWatchKeys.delete(registration.senderId);
    }
  }

  private createWatcher(watchKey: string, sender: WebContents, filePath: string): FSWatcher {
    return watch(
      filePath,
      {
        persistent: false,
      },
      eventType => {
        const registration = this.watcherRegistrations.get(watchKey);
        if (!registration || sender.isDestroyed()) {
          return;
        }

        if (eventType === "rename") {
          this.scheduleWatcherRestart(watchKey, sender, filePath);
        }

        sender.send("text-file-changed", { filePath });
      }
    );
  }

  private scheduleWatcherRestart(
    watchKey: string,
    sender: WebContents,
    filePath: string,
    attempt = 0
  ): void {
    const registration = this.watcherRegistrations.get(watchKey);
    if (!registration) {
      return;
    }

    if (registration.restartTimer) {
      clearTimeout(registration.restartTimer);
    }

    registration.restartTimer = setTimeout(() => {
      const currentRegistration = this.watcherRegistrations.get(watchKey);
      if (!currentRegistration || sender.isDestroyed()) {
        return;
      }

      currentRegistration.restartTimer = null;

      try {
        currentRegistration.watcher.close();
      } catch {
        // watcher 可能已被销毁
      }

      try {
        currentRegistration.watcher = this.createWatcher(watchKey, sender, filePath);
      } catch {
        if (attempt < 10) {
          this.scheduleWatcherRestart(watchKey, sender, filePath, attempt + 1);
        }
      }
    }, 150);
  }

  async watchTextFile(event: IpcMainInvokeEvent, filePath: string): Promise<void> {
    const sender = event.sender;
    const senderId = sender.id;
    const watchKey = this.getWatchKey(senderId, filePath);
    if (this.watcherRegistrations.has(watchKey)) {
      return;
    }

    this.ensureSenderCleanup(sender);
    const watcher = this.createWatcher(watchKey, sender, filePath);
    this.watcherRegistrations.set(watchKey, {
      filePath,
      senderId,
      watcher,
      restartTimer: null,
    });
    this.trackSenderWatchKey(senderId, watchKey);
  }

  unwatchTextFile(senderId: number, filePath: string): void {
    this.disposeWatcher(this.getWatchKey(senderId, filePath));
  }
}

export default new File();
