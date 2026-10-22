import { invoke } from "@/electron";
import type { HomeLayoutEntry } from "@/types/home-layout";

export const getHomeLayout = (): Promise<HomeLayoutEntry[]> => invoke("home-layout:get");

export const saveHomeLayout = (entries: HomeLayoutEntry[]): Promise<HomeLayoutEntry[]> =>
  invoke("home-layout:save", entries);
