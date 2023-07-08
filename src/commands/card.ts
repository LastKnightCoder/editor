import { invoke } from '@tauri-apps/api';
import { ICard } from "@/types";

export async function createCard(card: Pick<ICard, 'content' | 'tags'>): Promise<number> {
  return await invoke('insert_one_card', {
    content: JSON.stringify(card.content),
    tags: JSON.stringify(card.tags),
  });
}

export async function getAllCards(): Promise<ICard[]> {
  const list: any[] =  await invoke('find_all_cards');
  return list.map((item) => {
    return {
      ...item,
      content: JSON.parse(item.content),
      tags: JSON.parse(item.tags),
    }
  });
}

export async function deleteCard(id: number): Promise<number> {
  return await invoke('delete_one_card', {
    id
  });
}

export async function updateCard(card: Pick<ICard, 'content' | 'tags' | 'id'>): Promise<number> {
  return await invoke('update_one_card', {
    id: card.id,
    content: JSON.stringify(card.content),
    tags: JSON.stringify(card.tags),
  });
}

export async function findOneCard(id: number): Promise<ICard> {
  const res: any =  await invoke('find_one_card', {
    id
  });
  return {
    ...res,
    content: JSON.parse(res.content),
    tags: JSON.parse(res.tags),
  }
}