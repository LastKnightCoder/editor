import { invoke } from "@/electron";

export const setAlwaysOnTop = async (flag: boolean) => {
  return invoke("set-always-on-top", flag);
};

export const closeWindow = async () => {
  return invoke("close-window");
};
