import useSettingStore from "@/stores/useSettingStore";
import type { CommandScope } from "./command-context";

export interface MaterialActionScope extends CommandScope {
  databaseName: string;
}

export function captureMaterialActionScope(scope?: CommandScope): MaterialActionScope {
  const databaseName = scope?.databaseName ?? useSettingStore.getState().setting.database.active;
  if (!databaseName.trim()) throw new Error("工作区尚未就绪，请先打开工作区");
  return {
    databaseName,
    signal: scope?.signal,
  };
}

export function assertMaterialActionActive(scope: MaterialActionScope): void {
  scope.signal?.throwIfAborted();
  if (scope.databaseName !== useSettingStore.getState().setting.database.active)
    throw new Error("数据库已切换，请重新选择来源");
}
