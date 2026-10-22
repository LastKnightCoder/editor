/**
 * 外部材料的客户端动作清单：单一来源，插件经 context.materials.actions 获取同一组动作。
 * 只含宿主自己的动作，不含其他插件注册的对象动作（插件之间互不依赖）。
 * 动作自带结果提示，失败不向调用方抛出。
 */

import { isMaterialKind, type MaterialRef } from "@/entity/material";
import { convertMaterialToCard } from "./material-to-card";
import { captureMaterialActionScope } from "./material-action-scope";
import type { CommandScope } from "./command-context";

export interface MaterialAction {
  id: string;
  label: string;
  run(): Promise<void>;
}

export function parseMaterialRef(value: unknown): MaterialRef {
  const { kind, id } = (value ?? {}) as Partial<MaterialRef>;
  if (!isMaterialKind(kind) || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    throw new Error("材料地址无效");
  return { kind, id };
}

export function materialActions(ref: MaterialRef, options?: CommandScope): MaterialAction[] {
  const scope = captureMaterialActionScope(options);
  return [{ id: "card", label: "转为卡片", run: () => convertMaterialToCard(ref, scope) }];
}
