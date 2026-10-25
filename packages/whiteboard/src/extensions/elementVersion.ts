import type { BoardElement } from "../types";
import type { WhiteboardElementDefinition } from "./api";

/** 已装配扩展声明的元素定义表：type → 定义（含版本与迁移函数） */
export type ElementDefinitionTable = ReadonlyMap<string, WhiteboardElementDefinition>;

/** 元素数据侧版本：缺省或非法值（非正整数）按 1 处理 */
export function readElementSchemaVersion(element: BoardElement): number {
  const version = element.schemaVersion;
  return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : 1;
}

/** 定义侧版本：装配校验保证为正整数，缺省 1 */
export function readDefinitionSchemaVersion(definition: WhiteboardElementDefinition): number {
  return definition.schemaVersion ?? 1;
}
