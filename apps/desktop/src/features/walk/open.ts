/**
 * 打开一条漫步内容到原文：PDF 批注走材料解析，其余走实体导航；失败提示统一在此处理。
 */

import { toast } from "@tau/ui";
import { openEntity } from "@/services/open-content";
import { openMaterial } from "@/services/open-material";
import type { WalkItem } from "@/types";

export function openWalkItem(item: WalkItem): void {
  const { kind, id } = item.ref;
  const fail = () => toast.error("打开原文失败");
  if (kind === "pdf-annotation") {
    void openMaterial({ kind, id }).catch(fail);
  } else {
    void openEntity({ kind, id }).catch(fail);
  }
}
