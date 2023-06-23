import {ICard} from "../../../src/types";

export async function insertCard(card: ICard) {
  console.log('insertCard', card);
  return 0;
}

export async function getAllCards() {
  console.log('getAllCards');
  return [];
}

export async function deleteCard(id: number) {
  console.log('deleteCard', id);
  return 0;
}

export async function updateCard(card: ICard) {
  console.log('updateCard', card);
  return 0;
}