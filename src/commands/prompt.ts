import { invoke } from "@/electron";
import { Prompt, CreatePromptPayload, UpdatePromptPayload } from "@/types";

export const listPrompts = async (): Promise<Prompt[]> => {
  return invoke("prompt:list");
};

export const createPrompt = async (
  payload: CreatePromptPayload,
): Promise<Prompt> => {
  return invoke("prompt:create", payload);
};

export const updatePrompt = async (
  payload: UpdatePromptPayload,
): Promise<Prompt> => {
  return invoke("prompt:update", payload);
};

export const deletePrompt = async (id: number): Promise<number> => {
  return invoke("prompt:delete", id);
};

export const getPromptById = async (id: number): Promise<Prompt | null> => {
  return invoke("prompt:get", id);
};
