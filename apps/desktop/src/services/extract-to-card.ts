import { Editor, Range, type Descendant } from "slate";
import { toast } from "@tau/ui";
import { createScopedCard } from "@/commands/card";
import { buildQuoteAnchor } from "@/entity/quote-anchor";
import useSettingStore from "@/stores/useSettingStore";
import { ECardCategory } from "@/types";
import { getContentLength } from "@/utils/helper";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { openEntity } from "./open-content";

export type ExtractSource = { kind: "article" | "project-item"; id: number };

export function copyExtractedBlocks(content: Descendant[]): Descendant[] {
  return JSON.parse(
    JSON.stringify(content, (key, value) => (key === "collabId" ? undefined : value))
  );
}

export async function extractToCard(editor: Editor, range: Range, source: ExtractSource) {
  const databaseName = useSettingStore.getState().setting.database.active;
  const [start, end] = Range.edges(range);
  const quote = buildQuoteAnchor(editor.children, { start, end });
  const content = copyExtractedBlocks(Editor.fragment(editor, range));
  const card = await createScopedCard(
    databaseName,
    {
      content,
      count: getContentLength(content),
      tags: [],
      links: [],
      category: ECardCategory.Permanent,
      isTop: false,
    },
    {
      src: source,
      relation: "derived",
      srcAnchor: { quote },
    }
  );
  if (useSettingStore.getState().setting.database.active === databaseName) {
    defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
  }
  return card;
}

export async function extractToCardWithFeedback(
  editor: Editor,
  range: Range,
  source: ExtractSource
) {
  const databaseName = useSettingStore.getState().setting.database.active;
  try {
    const card = await extractToCard(editor, range, source);
    if (useSettingStore.getState().setting.database.active !== databaseName) return;
    toast.success("已抽成卡片", {
      action: {
        label: "打开",
        onClick: () => {
          if (useSettingStore.getState().setting.database.active !== databaseName) {
            toast.info("请切回原数据库后打开卡片");
            return;
          }
          void openEntity({ kind: "card", id: card.id }).catch(error => toast.error(String(error)));
        },
      },
    });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "抽成卡片失败");
  }
}
