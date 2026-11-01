import { invoke } from "@/electron";
import type { PluginMaterialRef } from "@tau/plugins";
import type { MaterialInfo } from "@/entity/material";
import type { ICard, ICreateCard } from "@/types";

export const resolvePluginMaterial = (ref: PluginMaterialRef): Promise<MaterialInfo> =>
  invoke("material:resolve-ref", ref);

export const createPluginMaterialCard = (
  ref: PluginMaterialRef,
  expected: MaterialInfo,
  card: ICreateCard
): Promise<ICard> => invoke("material:create-card", ref, expected, card);
