import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { watch, type FSWatcher } from "node:fs";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { ensureDir, pathExists, remove } from "fs-extra/esm";
import { sep, dirname, join, resolve } from "node:path";
import { Module } from "../types/module";

interface FileWatcherRegistration {
  filePath: string;
  senderId: number;
  watcher: FSWatcher;
  restartTimer: ReturnType<typeof setTimeout> | null;
}

class File implements Module {
  name: string;
  private watcherRegistrations = new Map<string, FileWatcherRegistration>();
  private senderWatchKeys = new Map<number, Set<string>>();
  private senderCleanupRegistered = new Set<number>();

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
    ipcMain.handle(
      "resolve-path-from",
      async (_event, baseDir: string, targetPath: string) => {
        return this.resolvePathFrom(baseDir, targetPath);
      },
    );
    ipcMain.handle("is-directory", async (_event, path) => {
      return await this.isDirectory(path);
    });
    ipcMain.handle(
      "watch-text-file",
      async (event: IpcMainInvokeEvent, filePath: string) => {
        return await this.watchTextFile(event, filePath);
      },
    );
    ipcMain.handle(
      "unwatch-text-file",
      async (event: IpcMainInvokeEvent, filePath: string) => {
        this.unwatchTextFile(event.sender.id, filePath);
      },
    );
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
    if (!watchKeys) {
      this.senderCleanupRegistered.delete(senderId);
      return;
    }

    Array.from(watchKeys).forEach((watchKey) => {
      this.disposeWatcher(watchKey);
    });
    this.senderWatchKeys.delete(senderId);
    this.senderCleanupRegistered.delete(senderId);
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

  private createWatcher(
    watchKey: string,
    sender: WebContents,
    filePath: string,
  ): FSWatcher {
    return watch(
      filePath,
      {
        persistent: false,
      },
      (eventType) => {
        const registration = this.watcherRegistrations.get(watchKey);
        if (!registration || sender.isDestroyed()) {
          return;
        }

        if (eventType === "rename") {
          this.scheduleWatcherRestart(watchKey, sender, filePath);
        }

        sender.send("text-file-changed", { filePath });
      },
    );
  }

  private scheduleWatcherRestart(
    watchKey: string,
    sender: WebContents,
    filePath: string,
    attempt = 0,
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
        currentRegistration.watcher = this.createWatcher(
          watchKey,
          sender,
          filePath,
        );
      } catch {
        if (attempt < 10) {
          this.scheduleWatcherRestart(watchKey, sender, filePath, attempt + 1);
        }
      }
    }, 150);
  }

  async watchTextFile(
    event: IpcMainInvokeEvent,
    filePath: string,
  ): Promise<void> {
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
