import { invoke } from "@/electron";
import { ICard, ICreateCard, IUpdateCard } from "@/types";

export async function createCard(card: ICreateCard): Promise<ICard> {
  return invoke("create-card", card);
}

export async function createCardFromProjectItem(
  projectItemId: number,
): Promise<ICard> {
  return invoke("create-card-from-project-item", projectItemId);
}

export async function getAllCards(): Promise<ICard[]> {
  return invoke("get-all-cards");
}

export async function deleteCard(id: number): Promise<number> {
  return invoke("delete-card", id);
}

export async function updateCard(card: IUpdateCard): Promise<ICard> {
  return invoke("update-card", card);
}

export async function getCardById(id: number): Promise<ICard> {
  return invoke("get-card-by-id", id);
}

export async function getTagsById(id: number): Promise<string[]> {
  return invoke("get-tags-by-id", id);
}

export async function getCardsGroupByTag(): Promise<Record<string, ICard[]>> {
  return invoke("get-cards-group-by-tag");
}

export async function getRandomPermanentCards(
  seed: number,
  count = 5,
): Promise<ICard[]> {
  return invoke("get-random-permanent-cards", { seed, count });
}

export const openCardInNewWindow = (databaseName: string, cardId: number) => {
  return invoke("open-card-in-new-window", databaseName, cardId, {
    showTitlebar: true,
    isDefaultTop: true,
  });
};

export async function getRecentTemporaryAndLiteratureCards(
  count = 10,
): Promise<ICard[]> {
  return invoke("get-recent-temp-lit-cards", count);
}

export async function isContentIsCard(contentId: number): Promise<boolean> {
  return invoke("is-content-is-card", contentId);
}

export async function buildCardFromContent(contentId: number): Promise<ICard> {
  return invoke("build-card-from-content", contentId);
}
