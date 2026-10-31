import { invoke } from "@tauri-apps/api/core";
import type { ImageSettingsMutation, SettingCompat } from "../types";
import { enqueueProviderConfigWrite } from "./provider-config";

export function mutateImageSettings(database: string, mutation: ImageSettingsMutation) {
  return enqueueProviderConfigWrite(() =>
    invoke<SettingCompat>("plugin_images_mutate", { database, mutation })
  );
}

export function mergeImageSettings(
  previous: SettingCompat,
  snapshot: SettingCompat
): SettingCompat {
  return previous.database.active === snapshot.database.active
    ? { ...previous, imageGeneration: snapshot.imageGeneration }
    : previous;
}
