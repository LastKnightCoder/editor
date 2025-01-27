import { invoke } from '@/electron';
import { ICard, ICreateCard, IUpdateCard } from "@/types";

export async function createCard(card: ICreateCard): Promise<ICard> {
  return invoke('create-card', card);
}

export async function getAllCards(): Promise<ICard[]> {
  return invoke('get-all-cards');
}

export async function deleteCard(id: number): Promise<number> {
  return invoke('delete-card', id);
}

export async function updateCard(card: IUpdateCard): Promise<ICard> {
  return invoke('update-card', card);
}

export async function getCardById(id: number): Promise<ICard> {
  return invoke('get_card-by-id', id);
}

export async function getTagsById(id: number): Promise<string[]> {
  return invoke('get-tags-by-id', id);
}

export async function getCardsGroupByTag(): Promise<Record<string, ICard[]>> {
  return invoke('get-cards-group-by-tag');
}
