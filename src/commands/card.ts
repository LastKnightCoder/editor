import { invoke } from '@tauri-apps/api';
import { ICard, History, CardHistory } from "@/types";

export async function createCard(card: Pick<ICard, 'content' | 'tags' | 'links'>): Promise<number> {
  return await invoke('insert_one_card', {
    content: JSON.stringify(card.content),
    tags: card.tags,
    links: card.links,
  });
}

export async function getAllCards(): Promise<ICard[]> {
  const list: any[] =  await invoke('find_all_cards');
  return list.map((item) => {
    return {
      ...item,
      content: JSON.parse(item.content),
    }
  });
}

export async function deleteCard(id: number): Promise<number> {
  return await invoke('delete_one_card', {
    id
  });
}

export async function updateCard(card: Pick<ICard, 'content' | 'tags' | 'id' | 'links'>): Promise<number> {
  return await invoke('update_one_card', {
    id: card.id,
    content: JSON.stringify(card.content),
    tags: card.tags,
    links: card.links,
  });
}

export async function findOneCard(id: number): Promise<ICard> {
  const res: any =  await invoke('find_one_card', {
    id
  });
  return {
    ...res,
    content: JSON.parse(res.content),
  }
}

export async function getTagsById(id: number): Promise<string[]> {
  return await invoke('get_tags_by_id', {
    id
  });
}

export async function getCardHistory(id: number, pageNumber: number, pageSize: number, ): Promise<CardHistory[]> {
  const list: History[] =  await invoke('get_card_history_list', {
    cardId: id,
    pageSize,
    pageNumber,
  });
  return list.map((item) => ({
    ...item,
    content: JSON.parse(item.content),
  }));
}

export async function getCardOperationList() {
  return await invoke('get_operation_list');
}
