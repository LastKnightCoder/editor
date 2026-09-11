import { cardCommands } from "@/commands/contracts/card";
import type { CardContentResult } from "@/commands/contracts/card";
import { ICard, ICreateCard, IUpdateCard } from "@/types";

export type { CardContentResult };

export async function createCard(card: ICreateCard): Promise<ICard> {
  return cardCommands.create.call(card);
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

export async function getTagsById(id: number): Promise<string[]> {
  return cardCommands.getTagsById.call(id);
}

export async function getCardsGroupByTag(): Promise<Record<string, ICard[]>> {
  return cardCommands.getGroupedByTag.call();
}

export async function getAllGlobalTags(): Promise<string[]> {
  return cardCommands.getAllGlobalTags.call();
}

export async function getRandomPermanentCards(seed: number, count = 5): Promise<ICard[]> {
  return cardCommands.getRandomPermanent.call({ seed, count });
}

export const openCardInNewWindow = (databaseName: string, cardId: number) => {
  return cardCommands.openInNewWindow.call(databaseName, cardId, {
    showTitlebar: true,
    isDefaultTop: true,
  });
};

export async function getRecentTemporaryAndLiteratureCards(count = 10): Promise<ICard[]> {
  return cardCommands.getRecentTempLit.call(count);
}

export async function isContentIsCard(contentId: number): Promise<boolean> {
  return cardCommands.isContentIsCard.call(contentId);
}

export async function getCardByContentId(contentId: number): Promise<ICard | null> {
  return cardCommands.getByContentId.call(contentId);
}

export async function buildCardFromContent(contentId: number): Promise<ICard> {
  return cardCommands.buildFromContent.call(contentId);
}

export async function getCardsByDates(dates: string[]): Promise<Record<string, ICard[]>> {
  return cardCommands.getByDates.call(dates);
}

export async function getCardsByDateRange(
  startDate: string,
  endDate: string
): Promise<Record<string, ICard[]>> {
  return cardCommands.getByDateRange.call(startDate, endDate);
}

export async function getCardsContentByIds(
  ids: number[],
  maxLength?: number
): Promise<CardContentResult[]> {
  return cardCommands.getContentByIds.call(ids, maxLength);
}
