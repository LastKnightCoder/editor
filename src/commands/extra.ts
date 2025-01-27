import { invoke } from '@/electron';

export const openExternal = async (url: string) => {
  return await invoke('open-external', url);
}

export const nodeFetch = async (url: string, options: any) => {
  return await invoke('node-fetch', url, options);
}