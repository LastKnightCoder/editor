/**
 * 外部材料的客户端动作清单：单一来源，插件经 context.materials.actions 获取同一组动作。
 * 动作自带结果提示，失败不向调用方抛出。
 */

import { toast } from "@tau/ui";
import { isMaterialKind, type MaterialRef } from "@/entity/material";
import { convertMaterialToCard } from "./material-to-card";
import { requestMaterialQuestionCapture } from "./question-capture";

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

export function materialActions(ref: MaterialRef): MaterialAction[] {
  return [
    { id: "card", label: "转为卡片", run: () => convertMaterialToCard(ref) },
    {
      id: "question",
      label: "转为问题",
      run: async () => {
        try {
          await requestMaterialQuestionCapture(ref);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "这条材料已不存在");
        }
      },
    },
  ];
}
