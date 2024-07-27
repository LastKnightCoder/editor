import { invoke } from '@tauri-apps/api';

export const showInFolder = async (path: string) => {
  await invoke('show_in_folder', {
    path,
  })
}