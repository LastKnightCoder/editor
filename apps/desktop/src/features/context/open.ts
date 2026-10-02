/**
 * 打开脉络条目：正文实体走 openEntity，外部材料走 openMaterialTarget，其余（对话、Notebook、闪卡卡组、
 * 白板、待办、问题）打开各自的页面。
 */

import { openEntity } from "@/services/open-content";
import { openMaterialTarget } from "@/services/open-material";
import { openPage } from "@/services/page-navigation";
import type { ContextOpenTarget } from "@/types/entity-context";
import { serializeEntityLocation } from "@/entity/locate";

export async function openContextTarget(target: ContextOpenTarget): Promise<void> {
  switch (target.page) {
    case "entity":
      return target.at ? openEntity(target.ref, { at: target.at }) : openEntity(target.ref);
    case "chat":
      return openPage("chat", { id: target.id });
    case "vibe-learning-detail":
      return openPage("vibe-learning-detail", { id: target.id });
    case "review":
      return openPage("review", { deckId: target.deckId });
    case "whiteboard-detail":
      return openPage("whiteboard-detail", { id: target.id, page: target.pageId });
    case "diary":
      return openPage("diary", {
        date: target.date,
        moment: String(target.momentId),
        ...(target.at ? { at: serializeEntityLocation(target.at) } : {}),
      });
    case "todos":
      return openPage("todos", { selectedId: target.selectedId });
    case "questions":
      return openPage("questions", { selectedId: target.selectedId });
    case "material":
      return openMaterialTarget(target.target);
  }
}
