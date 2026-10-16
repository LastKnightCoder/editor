/**
 * 外部材料「转为卡片」（E4）：复制原文（引用块）+ 想法 / 批注 + 出处，新建一张文献卡片，并记谱系
 * excerpt_of（材料 → 卡片）。是复制不是投影：卡片之后各自演化，原划线删了卡片照旧（KL-011 同理）。
 */

import { toast } from "@tau/ui";
import { createScopedCard } from "@/commands/card";
import { recordLineage } from "@/commands/lineage";
import type { MaterialInfo, MaterialRef } from "@/entity/material";
import { materialQuoteMarkdown } from "@/entity/material-markdown";
import useSettingStore from "@/stores/useSettingStore";
import type { ICard } from "@/types";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { getContentLength } from "@/utils/helper";
import { importFromMarkdown } from "@/utils/markdown";
import { openEntity } from "./open-content";
import { resolveMaterials } from "./open-material";
import { bindDatabaseCommands, type CommandScope } from "./command-context";
import { assertMaterialActionActive, captureMaterialActionScope } from "./material-action-scope";

/** 卡片正文的 Markdown：引用块原文，空一行写想法，末行出处 */
export const materialCardMarkdown = (info: Pick<MaterialInfo, "quote" | "note" | "meta">) =>
  materialQuoteMarkdown(info);

export async function createCardFromMaterial(
  ref: MaterialRef,
  options?: CommandScope
): Promise<ICard> {
  const scope = captureMaterialActionScope(options);
  assertMaterialActionActive(scope);
  const { databaseName } = scope;
  const [info] = await bindDatabaseCommands({ resolveMaterials }, scope).resolveMaterials([ref]);
  assertMaterialActionActive(scope);
  if (!info || (!info.quote && !info.note)) throw new Error("这条划线没有可转的文字");
  const content = importFromMarkdown(materialCardMarkdown(info));
  const commands = bindDatabaseCommands({ createScopedCard, recordLineage }, { databaseName });
  const card = await commands.createScopedCard(databaseName, {
    content,
    count: getContentLength(content),
    tags: [],
    isTop: false,
  });
  if (
    !scope.signal?.aborted &&
    useSettingStore.getState().setting.database.active === databaseName
  ) {
    defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
  }
  await commands.recordLineage({
    src: ref,
    dst: { kind: "card", id: card.id },
    relation: "excerpt_of",
  });
  return card;
}

/** 界面入口：转为卡片并提示，提示上带「打开」 */
export async function convertMaterialToCard(
  ref: MaterialRef,
  options?: CommandScope
): Promise<void> {
  const scope = captureMaterialActionScope(options);
  try {
    const card = await createCardFromMaterial(ref, scope);
    if (
      scope.signal?.aborted ||
      useSettingStore.getState().setting.database.active !== scope.databaseName
    )
      return;
    toast.success("已转为卡片", {
      action: {
        label: "打开",
        onClick: () => {
          try {
            assertMaterialActionActive(scope);
            void openEntity({ kind: "card", id: card.id });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "当前无法打开卡片");
          }
        },
      },
    });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "转为卡片失败");
  }
}
