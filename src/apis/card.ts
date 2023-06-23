// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const api = window.api;

import { ICard } from "@/types";

export async function insertCard(card: Pick<ICard, 'content' | 'tags'>): Promise<number> {
  return await api.insertCard(card);
}

export async function getAllCards(): Promise<ICard[]> {
  return await api.getAllCards();
}

export async function deleteCard(id: number): Promise<number> {
  return await api.deleteCard(id);
}

export async function updateCard(card: Pick<ICard, 'content' | 'tags' | 'id'>): Promise<number> {
  return await api.updateCard(card);
}
