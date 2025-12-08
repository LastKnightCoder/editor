import { invoke } from "@/electron";
import type {
  SlideGroup,
  CreateSlideGroup,
  UpdateSlideGroup,
} from "@/types/slide";

export const createSlideGroup = async (
  data: CreateSlideGroup,
): Promise<SlideGroup> => {
  return await invoke("slide-group:create", data);
};

export const updateSlideGroup = async (
  data: UpdateSlideGroup,
): Promise<SlideGroup> => {
  return await invoke("slide-group:update", data);
};

export const deleteSlideGroup = async (id: number): Promise<number> => {
  return await invoke("slide-group:delete", id);
};

export const getAllSlideGroups = async (): Promise<SlideGroup[]> => {
  return await invoke("slide-group:get-all");
};

export const getSlideGroupById = async (id: number): Promise<SlideGroup> => {
  return await invoke("slide-group:get-by-id", id);
};
