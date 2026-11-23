import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import { cardCommands } from "@/commands/contracts/card";
import { openEditorWindow } from "@/commands/window";
import type { CardContentResult } from "@/commands/contracts/card";
import { ICard, ICreateCard, IUpdateCard } from "@/types";
import type { CardMetadataPatch } from "@/types/card";
import type { TagCount } from "@/utils/tags";

export type { CardContentResult };

export async function getScopedCards(databaseName: string): Promise<ICard[]> {
  return cardCommands.getScoped.call({ databaseName });
}

export async function getScopedCard(databaseName: string, id: number): Promise<ICard> {
  return cardCommands.getScopedDetail.call({ databaseName, id });
}

export async function createScopedCard(databaseName: string, card: ICreateCard): Promise<ICard> {
  const command = bindDatabaseCommands(cardCommands.createScoped, currentCommandScope());
  return command.call({
    databaseName,
    card: {
      ...card,
      ...(await (
        await import("@/services/editorKit")
      ).prepareNewContent(card.content, card.contracts)),
    },
  });
}

export async function patchScopedCard(
  databaseName: string,
  id: number,
  patch: CardMetadataPatch
): Promise<ICard> {
  return cardCommands.patchScoped.call({ databaseName, id, patch });
}

export async function deleteScopedCard(databaseName: string, id: number): Promise<number> {
  return cardCommands.removeScoped.call({ databaseName, id });
}

export async function getScopedCardTagCounts(databaseName: string): Promise<TagCount[]> {
  return cardCommands.tagCountsScoped.call({ databaseName });
}

export async function renameScopedCardTag(
  databaseName: string,
  from: string,
  to: string
): Promise<ICard[]> {
  return cardCommands.renameTagScoped.call({ databaseName, from, to });
}

export async function removeScopedCardTag(databaseName: string, tag: string): Promise<ICard[]> {
  return cardCommands.removeTagScoped.call({ databaseName, tag });
}

export async function createCard(card: ICreateCard): Promise<ICard> {
  const command = bindDatabaseCommands(cardCommands.create, currentCommandScope());
  return command.call({
    ...card,
    ...(await (
      await import("@/services/editorKit")
    ).prepareNewContent(card.content, card.contracts)),
  });
}

export async function createCardFromProjectItem(projectItemId: number): Promise<ICard> {
  return cardCommands.createFromProjectItem.call(projectItemId);
}

export async function getAllCards(): Promise<ICard[]> {
  return cardCommands.getAll.call();
}

export async function deleteCard(id: number): Promise<number> {
  return cardCommands.remove.call(id);
}

export async function updateCard(card: IUpdateCard): Promise<ICard> {
  return cardCommands.update.call(card);
}

export async function getCardById(id: number): Promise<ICard> {
  return cardCommands.getById.call(id);
}

export const openCardInNewWindow = (databaseName: string, cardId: number) => {
  return openEditorWindow({ kind: "card", databaseName, id: cardId });
};

export async function isContentIsCard(contentId: number): Promise<boolean> {
  return cardCommands.isContentIsCard.call(contentId);
}

export async function getCardByContentId(contentId: number): Promise<ICard | null> {
  return cardCommands.getByContentId.call(contentId);
}

export async function buildCardFromContent(contentId: number): Promise<ICard> {
  return cardCommands.buildFromContent.call(contentId);
}

export async function getCardsByDateRange(
  startDate: string,
  endDate: string
): Promise<Record<string, ICard[]>> {
  return cardCommands.getByDateRange.call(startDate, endDate);
}
