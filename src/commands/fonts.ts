import { invoke } from "@/electron";

export const getAllFonts = async (): Promise<string[]> => {
  return await invoke("get-all-fonts");
};
