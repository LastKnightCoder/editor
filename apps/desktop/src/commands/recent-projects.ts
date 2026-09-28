import { invoke } from "@/electron";

/** 最近打开的 Markdown 文件 / 文件夹（主进程已剔除不存在的路径） */
export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  isDirectory: boolean;
}

export const getRecentProjects = async (): Promise<RecentProject[]> => {
  return await invoke("get-recent-projects");
};

export const addRecentProject = async (projectPath: string): Promise<void> => {
  return await invoke("add-recent-project", projectPath);
};

export const clearRecentProjects = async (): Promise<void> => {
  return await invoke("clear-recent-projects");
};
