import { invoke } from "@/electron";
export const showInFolder = async (path: string) => {
  await invoke("show-in-folder", path);
};

export const getEditorDir = async () => {
  return await invoke("get-app-dir");
};

export const getHomeDir = async () => {
  return await invoke("get-home-dir");
};

export const selectFile = async (
  options?: object,
): Promise<string[] | null> => {
  return await invoke("select-file", options);
};

export const getFileBaseName = async (
  filePath: string,
  noExtension?: boolean,
) => {
  return await invoke("get-file-basename", filePath, noExtension);
};

export const getFileExtension = async (filePath: string): Promise<string> => {
  return await invoke("get-file-extension", filePath);
};

export const readBinaryFile = async (filePath: string): Promise<Uint8Array> => {
  return await invoke("read-binary-file", filePath);
};

export const writeBinaryFile = async (
  filePath: string,
  contents: Uint8Array,
): Promise<void> => {
  return await invoke("write-binary-file", filePath, contents);
};

export const readTextFile = async (filePath: string): Promise<string> => {
  return await invoke("read-text-file", filePath);
};

export const writeTextFile = async (
  filePath: string,
  contents: string,
): Promise<void> => {
  return await invoke("write-text-file", filePath, contents);
};

export const createDir = async (dirPath: string): Promise<void> => {
  return await invoke("create-dir", dirPath);
};

export const pathExists = async (path: string): Promise<boolean> => {
  return await invoke("path-exists", path);
};

export const getSep = async (): Promise<string> => {
  return await invoke("get-sep");
};

export const removeFile = async (filePath: string): Promise<void> => {
  return await invoke("remove-file", filePath);
};

export const convertFileSrc = (filePath: string): string => {
  return `ltoh:///${filePath}`;
};

export const openMarkdownInNewWindow = async (filePath: string) => {
  return await invoke("open-markdown-in-new-window", filePath, {
    showTitlebar: false,
    isDefaultTop: false,
  });
};
