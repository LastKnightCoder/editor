import { invoke } from "@/electron";

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
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
