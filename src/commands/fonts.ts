import { invoke } from "@tauri-apps/api";

export const getAllFonts = async (): Promise<string[]> => {
  return await invoke('get_all_fonts');
}