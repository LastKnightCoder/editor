import { invoke } from '@tauri-apps/api';

export const showInFolder = async (path: string) => {
  await invoke('show_in_folder', {
    path,
  })
}

export const getEditorDir = async () => {
  return await invoke('get_editor_dir');
}