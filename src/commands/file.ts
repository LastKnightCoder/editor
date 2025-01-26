import { invoke } from '@/electron';

export const showInFolder = async (path: string) => {
  await invoke('show-in-folder', path)
}

export const getEditorDir = async () => {
  return await invoke('get-app-dir');
}

export const selectFile = async () => {
  return await invoke('select-file');
}

export const getFileBaseName = async (filePath: string) => {
  return await invoke('get-file-basename', filePath);
}