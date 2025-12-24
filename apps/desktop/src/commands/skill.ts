import { invoke } from "@/electron";
import { Skill, SkillDetail, SkillFile } from "@/types";

export const listSkills = async (): Promise<Skill[]> => {
  return invoke("skill:list");
};

export const getSkillDetail = async (
  folderName: string,
): Promise<SkillDetail | null> => {
  return invoke("skill:detail", folderName);
};

export const getSkillReadme = async (
  folderName: string,
): Promise<{ name: string; readmeContent: string } | null> => {
  return invoke("skill:readme", folderName);
};

export const getSkillFiles = async (
  folderName: string,
): Promise<SkillFile[]> => {
  return invoke("skill:files", folderName);
};

export const createSkillFolder = async (name: string): Promise<string> => {
  return invoke("skill:create-folder", name);
};

export const writeSkillFile = async (
  filePath: string,
  content: string,
): Promise<void> => {
  return invoke("skill:write-file", filePath, content);
};

export const deleteSkillFolder = async (folderName: string): Promise<void> => {
  return invoke("skill:delete-folder", folderName);
};

export const getSkillsDir = async (): Promise<string> => {
  return invoke("skill:get-skills-dir");
};

export const readSkillFile = async (filePath: string): Promise<string> => {
  return invoke("skill:read-file", filePath);
};

export const createDirectory = async (
  dirPath: string,
  dirName: string,
): Promise<string> => {
  return invoke("skill:create-directory", dirPath, dirName);
};

export const deleteFileOrFolder = async (targetPath: string): Promise<void> => {
  return invoke("skill:delete", targetPath);
};

export const renameFileOrFolder = async (
  oldPath: string,
  newName: string,
): Promise<string> => {
  return invoke("skill:rename", oldPath, newName);
};

export const createFile = async (
  dirPath: string,
  fileName: string,
): Promise<string> => {
  return invoke("skill:create-file", dirPath, fileName);
};

export const getFileTree = async (dirPath?: string): Promise<SkillFile[]> => {
  return invoke("skill:get-file-tree", dirPath);
};

export const showInFolder = async (filePath: string): Promise<void> => {
  return invoke("skill:show-in-folder", filePath);
};

export const getSkillTree = async (folderName: string): Promise<string> => {
  return invoke("skill:tree", folderName);
};
