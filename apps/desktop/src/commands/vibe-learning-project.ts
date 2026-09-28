import { invoke } from "@/electron";
import {
  VibeLearningProject,
  VibeLearningProjectSummary,
  CreateVibeLearningProject,
  UpdateVibeLearningProject,
} from "@/types";

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
