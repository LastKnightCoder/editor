import { platform } from "@/platform";

export const getAllFonts = async (): Promise<string[]> => {
  return platform.system.getFonts();
};
