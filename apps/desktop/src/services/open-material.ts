/**
 * 打开外部材料到原处（KL-031）：脉络、全局搜索、对话引用共用。打开目标由主进程 material:resolve 解析。
 */

import { openExternal } from "@/commands/extra";
import { invoke } from "@/electron";
import type { MaterialInfo, MaterialOpenTarget, MaterialRef } from "@/entity/material";
import { openEntity } from "./open-content";
import { openPage } from "./page-navigation";

export async function openMaterialTarget(target: MaterialOpenTarget): Promise<void> {
  switch (target.page) {
    case "weread-book":
      openPage("weread-book", {
        bookId: target.bookId,
        ...(target.bookmark ? { bookmark: target.bookmark } : {}),
      });
      return;
    case "pdf-detail":
      openPage("pdf-detail", { pdfId: target.pdfId, annotation: target.annotationId });
      return;
    case "external-url":
      await openExternal(target.url);
      return;
    case "project-web-clip":
      // 已剪藏的网页条目默认打开到「文档」分段
      await openEntity({ kind: "project-item", id: target.itemId });
      return;
  }
}

export const resolveMaterials = (refs: MaterialRef[]): Promise<MaterialInfo[]> =>
  invoke("material:resolve", refs);

/** 按地址打开；已删除或无法定位时抛错，由调用方提示 */
export async function openMaterial(ref: MaterialRef): Promise<void> {
  const [info] = await resolveMaterials([ref]);
  if (!info) throw new Error("材料已删除");
  if (!info.open) throw new Error(info.deleted ? "原划线已删除" : "无法打开到原处");
  await openMaterialTarget(info.open);
}
