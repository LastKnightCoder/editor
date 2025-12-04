import { invoke } from "@/electron";
import {
  CreateSlideAsset,
  CreateSlideDeck,
  CreateSlidePage,
  SlideAsset,
  SlideDeck,
  SlidePage,
  UpdateSlideDeck,
  UpdateSlidePage,
} from "@/types/slide";

export const createSlideDeck = async (
  payload: CreateSlideDeck,
): Promise<SlideDeck> => {
  return await invoke("slide-deck:create", payload);
};

export const updateSlideDeck = async (
  payload: UpdateSlideDeck,
): Promise<SlideDeck> => {
  return await invoke("slide-deck:update", payload);
};

export const deleteSlideDeck = async (id: number): Promise<number> => {
  return await invoke("slide-deck:delete", id);
};

export const getSlideDeckById = async (id: number): Promise<SlideDeck> => {
  return await invoke("slide-deck:get", id);
};

export const getSlideDecks = async (): Promise<SlideDeck[]> => {
  return await invoke("slide-deck:get-all");
};

export const createSlidePage = async (
  payload: CreateSlidePage,
): Promise<SlidePage> => {
  return await invoke("slide-page:create", payload);
};

export const updateSlidePage = async (
  payload: UpdateSlidePage,
): Promise<SlidePage> => {
  return await invoke("slide-page:update", payload);
};

export const deleteSlidePage = async (id: number): Promise<number> => {
  return await invoke("slide-page:delete", id);
};

export const getSlidePageById = async (id: number): Promise<SlidePage> => {
  return await invoke("slide-page:get", id);
};

export const getSlidePagesByDeck = async (
  deckId: number,
): Promise<SlidePage[]> => {
  return await invoke("slide-page:get-by-deck", deckId);
};

export const createSlideAsset = async (
  payload: CreateSlideAsset,
): Promise<SlideAsset> => {
  return await invoke("slide-asset:create", payload);
};

export const deleteSlideAsset = async (id: number): Promise<number> => {
  return await invoke("slide-asset:delete", id);
};

export const getSlideAssetsByDeck = async (
  deckId: number,
): Promise<SlideAsset[]> => {
  return await invoke("slide-asset:get-by-deck", deckId);
};
