import { Editor, Range, type Descendant } from "slate";
import { toast } from "@tau/ui";
import { createScopedCard } from "@/commands/card";
import { recordLineage } from "@/commands/lineage";
import { buildQuoteAnchor } from "@/entity/quote-anchor";
import useSettingStore from "@/stores/useSettingStore";
import { ECardCategory } from "@/types";
import { getContentLength } from "@/utils/helper";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { bindDatabaseCommands } from "./command-context";
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
  const commands = bindDatabaseCommands({ recordLineage }, { databaseName });
  const card = await createScopedCard(databaseName, {
    content,
    count: getContentLength(content),
    tags: [],
    links: [],
    category: ECardCategory.Permanent,
    isTop: false,
  });
  await commands.recordLineage({
    src: source,
    dst: { kind: "card", id: card.id },
    relation: "derived",
    srcAnchor: { quote },
  });
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
  try {
    const card = await extractToCard(editor, range, source);
    toast.success("已抽成卡片", {
      action: { label: "打开", onClick: () => void openEntity({ kind: "card", id: card.id }) },
    });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "抽成卡片失败");
  }
}
