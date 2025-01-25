import { invoke } from '@/electron';

export async function getSetting(): Promise<string> {
  return await invoke('read-setting');
}

export async function saveSetting(setting: string): Promise<void> {
  return await invoke('write-setting', setting);
}
