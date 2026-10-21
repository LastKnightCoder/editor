import { invoke } from "@/electron";
import {
  VibeLearningProject,
  VibeLearningProjectSummary,
  VibeLearningOpenedItem,
  CreateVibeLearningProject,
  UpdateVibeLearningProject,
} from "@/types";
import type { ContextLineageItem } from "@/types/entity-context";

export const createVibeLearningProject = async (
  payload: CreateVibeLearningProject
): Promise<VibeLearningProject> => {
  return invoke("vibe-learning-project:create", payload);
};

export const updateVibeLearningProject = async (
  payload: UpdateVibeLearningProject
): Promise<VibeLearningProject | null> => {
  return invoke("vibe-learning-project:update", payload);
};

export const deleteVibeLearningProject = async (id: number): Promise<number> => {
  return invoke("vibe-learning-project:delete", id);
};

export const getVibeLearningProject = async (id: number): Promise<VibeLearningProject | null> => {
  return invoke("vibe-learning-project:get", id);
};

export const listVibeLearningProjects = async (): Promise<VibeLearningProjectSummary[]> => {
  return invoke("vibe-learning-project:list");
};

/** 记录打开（不改 updateTime）；item 缺省时保留上次打开的资料 / 笔记 */
export const recordVibeLearningProjectOpen = async (
  id: number,
  item?: VibeLearningOpenedItem
): Promise<void> => {
  await invoke("vibe-learning-project:record-open", id, item ?? null);
};

/** 由什么立项（问题、卡片、插件内容等）；没有或来源已删除时为 null */
export async function getVibeLearningProjectSource(id: number): Promise<ContextLineageItem | null> {
  return invoke("vibe-learning-project:source", id);
}
