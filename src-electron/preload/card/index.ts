import { ipcRenderer } from 'electron';
import {ICard} from "../../../src/types";

export async function insertCard(card: ICard): Promise<number> {
  return await ipcRenderer.invoke('insert_card', card);
}

export async function getAllCards(): Promise<ICard[]> {
  return await ipcRenderer.invoke('find_all_cards');
}

export async function deleteCard(id: number): Promise<number> {
  return await ipcRenderer.invoke('delete_one_card', id);
}

export async function updateCard(card: ICard): Promise<number> {
  return await ipcRenderer.invoke('update_one_card', card);
}