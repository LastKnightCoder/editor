import { ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir, pathExists } from 'fs-extra/esm';
import { sep } from 'node:path';
import { Module } from '../types/module';

class File implements Module {
  name: string;
  constructor() {
    this.name = 'file';
  }

  async init() {
    ipcMain.handle('read-binary-file', async (_event, filePath) => {
      return await this.readBinaryFile(filePath);
    });
    ipcMain.handle('write-binary-file', async (_event, filePath, content) => {
      return await this.writeBinaryFile(filePath, content);
    });
    ipcMain.handle('read-text-file', async (_event, filePath) => {
      return await this.readTextFile(filePath);
    });
    ipcMain.handle('write-text-file', async (_event, filePath, content) => {
      return await this.writeTextFile(filePath, content);
    });
    ipcMain.handle('create-dir', async (_event, dirPath) => {
      return await this.createDir(dirPath);
    });
    ipcMain.handle('path-exists', async (_event, path) => {
      return await this.pathExists(path);
    });
    ipcMain.handle('get-sep', () => {
      return this.getSep();
    })
  }

  async readBinaryFile(filePath: string): Promise<Uint8Array> {
    return await readFile(filePath);
  }

  async writeBinaryFile(filePath: string, contents: Uint8Array): Promise<void> {
    return await writeFile(filePath, contents);
  }

  async readTextFile(filePath: string): Promise<string> {
    return await readFile(filePath, { encoding: 'utf-8' });
  }

  async writeTextFile(filePath: string, contents: string): Promise<void> {
    return await writeFile(filePath, contents, { encoding: 'utf-8' });
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
}

export default new File();