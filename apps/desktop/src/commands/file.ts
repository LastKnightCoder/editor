import { invoke } from "@/electron";
import { platform } from "@/platform";
import type { FileSelectOptions } from "@tau/platform";

export interface TextFileChangedPayload {
  filePath: string;
}

export interface DirectoryChangedPayload {
  directoryPath: string;
}

export type TextFileChangedListener = (_event: unknown, payload: TextFileChangedPayload) => void;
export const showInFolder = async (path: string) => {
  await platform.shell.showInFolder(path);
};

export const getEditorDir = async () => {
  return platform.system.getAppDir();
};

export const getHomeDir = async () => {
  return platform.system.getHomeDir();
};

export const getUserDataDir = async () => {
  return platform.system.getUserDataDir();
};

export const selectFile = async (options?: FileSelectOptions): Promise<string[] | null> => {
  return platform.fileDialog.selectFile(options);
};

export const getFileBaseName = async (filePath: string, noExtension?: boolean) => {
  return await invoke<string>("get-file-basename", filePath, noExtension);
};

export const getFileExtension = async (filePath: string): Promise<string> => {
  return await invoke("get-file-extension", filePath);
};

export const readBinaryFile = async (filePath: string): Promise<Uint8Array> => {
  return platform.localFile.readBinaryFile(filePath);
};

export const writeBinaryFile = async (filePath: string, contents: Uint8Array): Promise<void> => {
  return platform.localFile.writeBinaryFile(filePath, contents);
};

export const readTextFile = async (filePath: string): Promise<string> => {
  return platform.localFile.readTextFile(filePath);
};

export const writeTextFile = async (filePath: string, contents: string): Promise<void> => {
  return platform.localFile.writeTextFile(filePath, contents);
};

export const createTextFileExclusive = async (
  filePath: string,
  contents: string
): Promise<void> => {
  return platform.localFile.createTextFileExclusive(filePath, contents);
};

export const watchTextFile = async (filePath: string): Promise<void> => {
  return platform.localFile.watchTextFile(filePath);
};

export const unwatchTextFile = async (filePath: string): Promise<void> => {
  return platform.localFile.unwatchTextFile(filePath);
};

// 兼容旧 on/off 注册模型：platform 订阅返回取消函数，按 listener 引用暂存
const textFileChangedDisposers = new WeakMap<TextFileChangedListener, () => void>();

export const onTextFileChanged = (listener: TextFileChangedListener): void => {
  const dispose = platform.localFile.onTextFileChanged(payload => listener(undefined, payload));
  textFileChangedDisposers.set(listener, dispose);
};

export const offTextFileChanged = (listener: TextFileChangedListener): void => {
  textFileChangedDisposers.get(listener)?.();
  textFileChangedDisposers.delete(listener);
};

export type DirectoryChangedListener = (_event: unknown, payload: DirectoryChangedPayload) => void;

const directoryChangedDisposers = new WeakMap<DirectoryChangedListener, () => void>();

export const watchDirectory = async (directoryPath: string): Promise<void> => {
  return platform.localFile.watchDirectory(directoryPath);
};

export const unwatchDirectory = async (directoryPath: string): Promise<void> => {
  return platform.localFile.unwatchDirectory(directoryPath);
};

export const onDirectoryChanged = (listener: DirectoryChangedListener): void => {
  const dispose = platform.localFile.onDirectoryChanged(payload => listener(undefined, payload));
  directoryChangedDisposers.set(listener, dispose);
};

export const offDirectoryChanged = (listener: DirectoryChangedListener): void => {
  directoryChangedDisposers.get(listener)?.();
  directoryChangedDisposers.delete(listener);
};

export const renameFileOrDirectory = async (oldPath: string, newPath: string): Promise<void> => {
  return platform.localFile.rename(oldPath, newPath);
};

export const createDir = async (dirPath: string): Promise<void> => {
  return platform.localFile.createDir(dirPath);
};

export const pathExists = async (path: string): Promise<boolean> => {
  return platform.localFile.exists(path);
};

export const getSep = async (): Promise<string> => {
  return await invoke("get-sep");
};

export const removeFile = async (filePath: string): Promise<void> => {
  return platform.localFile.removeFile(filePath);
};

export const convertFileSrc = async (filePath: string): Promise<string> => {
  const appDir = await getEditorDir();
  const normalizedAppDir = appDir.replace(/\\/g, "/");
  const normalizedFilePath = filePath.replace(/\\/g, "/");

  if (normalizedFilePath.startsWith(normalizedAppDir)) {
    const relativePath = normalizedFilePath.replace(normalizedAppDir, "");
    const withLeadingSlash = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
    return `http://localhost:24678${withLeadingSlash}`;
  }

  return `ltoh:///${normalizedFilePath}`;
};

export const openMarkdownInNewWindow = async (filePath: string) => {
  return platform.window.openMarkdownWindow(filePath, {
    showTitlebar: true,
    isDefaultTop: false,
  });
};

export const generateCacheKey = async (url: string): Promise<string> => {
  return await invoke("generate-cache-key", url);
};

export const compressImage = async (buffer: Uint8Array, mimeType: string): Promise<Uint8Array> => {
  return await invoke("compress-image", buffer, mimeType);
};

export const readDirectory = async (
  dirPath: string
): Promise<{ name: string; path: string; isDirectory: boolean }[]> => {
  return platform.localFile.readDirectory(dirPath);
};

export const getDirectoryName = async (filePath: string): Promise<string> => {
  return await invoke("get-directory-name", filePath);
};

export const resolvePathFrom = async (baseDir: string, targetPath: string): Promise<string> => {
  return await invoke("resolve-path-from", baseDir, targetPath);
};

export const isDirectory = async (path: string): Promise<boolean> => {
  return await invoke("is-directory", path);
};

export const openFileWithDefaultApp = async (path: string): Promise<string> => {
  return platform.shell.openFileWithDefaultApp(path);
};
