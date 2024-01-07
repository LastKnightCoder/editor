import { invoke } from '@tauri-apps/api';
import { ICard, ICreateCard, IUpdateCard } from "@/types";

export async function createCard(card: ICreateCard): Promise<number> {
  return await invoke('insert_one_card', {
    content: JSON.stringify(card.content),
    tags: card.tags,
    links: card.links,
    category: card.category,
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

export async function updateCard(card: IUpdateCard): Promise<number> {
  return await invoke('update_one_card', {
    id: card.id,
    content: JSON.stringify(card.content),
    tags: card.tags,
    links: card.links,
    category: card.category,
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

export async function getCardsGroupByTag(): Promise<Record<string, ICard[]>> {
  const res: any = await invoke('get_cards_group_by_tag');

  for (const key in res) {
    if (Object.prototype.hasOwnProperty.call(res, key)) {
      res[key] = res[key].map((item: any) => {
        return {
          ...item,
          content: JSON.parse(item.content),
        }
      })
    }
  }

  return res;
}
