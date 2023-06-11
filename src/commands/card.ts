import { invoke } from '@tauri-apps/api';
import { ICard } from "@/types";

export async function insertCard(card: Pick<ICard, 'content' | 'tags'>): Promise<number> {
  return await invoke('insert_one_card', card);
}

export async function getAllCards(): Promise<ICard[]> {
  return await invoke('find_all_cards');
}

export async function deleteCard(id: number): Promise<number> {
  return await invoke('delete_one_card', {
    id
  });
}

export async function updateCard(card: Pick<ICard, 'content' | 'tags' | 'id'>): Promise<number> {
  return await invoke('update_one_card', card);
}
