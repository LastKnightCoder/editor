import { invoke } from '@tauri-apps/api';

export async function getSetting(): Promise<string> {
  return await invoke('read_setting');
}

export async function saveSetting(setting: string): Promise<void> {
  return await invoke('write_setting', {
    setting
  });
}
