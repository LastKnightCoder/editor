import { invoke } from "@/electron";
import {
  Shortcut,
  CreateShortcutPayload,
  UpdateShortcutPayload,
  FindShortcutParams,
} from "@/types";

export const fetchShortcuts = async (): Promise<Shortcut[]> => {
  return invoke("shortcut:list");
};

export const createShortcut = async (
  payload: CreateShortcutPayload,
): Promise<Shortcut> => {
  return invoke("shortcut:create", payload);
};

export const updateShortcut = async (
  payload: UpdateShortcutPayload,
): Promise<Shortcut> => {
  return invoke("shortcut:update", payload);
};

export const deleteShortcut = async (id: number): Promise<number> => {
  return invoke("shortcut:delete", id);
};

export const reorderShortcuts = async (
  orderedIds: number[],
): Promise<number> => {
  return invoke("shortcut:reorder", { orderedIds });
};

export const findShortcut = async (
  params: FindShortcutParams,
): Promise<Shortcut | null> => {
  return invoke("shortcut:find", params);
};
