import { invoke } from '@/electron';

export const showInFolder = async (path: string) => {
  await invoke('show-in-folder', path)
}

export const getEditorDir = async () => {
  return await invoke('get-app-dir');
}