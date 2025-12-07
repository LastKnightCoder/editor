import { invoke } from "@/electron";
import {
  CalendarGroup,
  CreateCalendarGroup,
  UpdateCalendarGroup,
} from "@/types/calendar";

export const getAllCalendarGroups = async (): Promise<CalendarGroup[]> => {
  return await invoke("calendar-group:get-all");
};

export const getCalendarGroupById = async (
  id: number,
): Promise<CalendarGroup> => {
  return await invoke("calendar-group:get-by-id", id);
};

export const createCalendarGroup = async (
  data: CreateCalendarGroup,
): Promise<CalendarGroup> => {
  return await invoke("calendar-group:create", data);
};

export const updateCalendarGroup = async (
  data: UpdateCalendarGroup,
): Promise<CalendarGroup> => {
  return await invoke("calendar-group:update", data);
};

export const deleteCalendarGroup = async (id: number): Promise<number> => {
  return await invoke("calendar-group:delete", id);
};
