import { invoke } from "@/electron";
import type {
  Skill,
  SkillDetail,
  SkillImportInspection,
  SkillImportSource,
  SkillLinkedDir,
  SkillScriptRunRequest,
  SkillScriptRunResult,
} from "@/types";

/** 我的 + 已启用关联目录的 Skill（内置 Skill 在渲染端合并，见 useSkillStore） */
export const listSkills = async (): Promise<Skill[]> => invoke("skill:list");

export const getSkillDetail = async (skillPath: string): Promise<SkillDetail | null> =>
  invoke("skill:detail", skillPath);

export const getSkillReadme = async (skillPath: string): Promise<string | null> =>
  invoke("skill:readme", skillPath);

export const getSkillTree = async (skillPath: string): Promise<string> =>
  invoke("skill:tree", skillPath);

export const getSkillsDir = async (): Promise<string> => invoke("skill:get-skills-dir");

export const readSkillFile = async (filePath: string): Promise<string> =>
  invoke("skill:read-file", filePath);

export const writeSkillFile = async (filePath: string, content: string): Promise<void> =>
  invoke("skill:write-file", filePath, content);

export const createSkill = async (payload: {
  name: string;
  description?: string;
  manual?: boolean;
  body?: string;
}): Promise<Skill> => invoke("skill:create", payload);

/** 移到系统回收站（macOS 为废纸篓） */
export const deleteSkill = async (skillPath: string): Promise<void> =>
  invoke("skill:delete-skill", skillPath);

export const createSkillEntry = async (
  dirPath: string,
  name: string,
  isDirectory: boolean
): Promise<string> => invoke("skill:create-entry", dirPath, name, isDirectory);

export const renameSkillEntry = async (oldPath: string, newName: string): Promise<string> =>
  invoke("skill:rename", oldPath, newName);

export const deleteSkillEntry = async (targetPath: string): Promise<void> =>
  invoke("skill:delete-entry", targetPath);

export const showSkillInFolder = async (filePath: string): Promise<void> =>
  invoke("skill:show-in-folder", filePath);

export const exportSkillZip = async (skillPath: string): Promise<Uint8Array> =>
  invoke("skill:export-zip", skillPath);

export const getLinkedSkillDirs = async (): Promise<SkillLinkedDir[]> => invoke("skill:links:get");

export const setLinkedSkillDirs = async (
  links: Array<{ path: string; enabled: boolean; selectedSkills?: string[] }>
): Promise<void> => invoke("skill:links:set", links);

export const inspectSkillImport = async (
  source: SkillImportSource
): Promise<SkillImportInspection> => invoke("skill:import:inspect", source);

export const commitSkillImport = async (
  token: string,
  items: Array<{ relPath: string; overwrite?: boolean }>
): Promise<string[]> => invoke("skill:import:commit", token, items);

export const discardSkillImport = async (token: string): Promise<void> =>
  invoke("skill:import:discard", token);

export const runSkillScript = async (
  request: SkillScriptRunRequest,
  runId?: string
): Promise<SkillScriptRunResult> => invoke("skill:run-script", request, runId);

export const cancelSkillScript = async (runId: string): Promise<boolean> =>
  invoke("skill:cancel-script", runId);
