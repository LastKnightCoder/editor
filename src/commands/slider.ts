import { invoke } from "@/electron";
import {
  SliderDeck,
  SliderPage,
  SliderEditorBlock,
  SliderTemplateSet,
  SliderTemplate,
  ICreateSliderDeck,
  IUpdateSliderDeck,
  ICreateSliderPage,
  IUpdateSliderPage,
  ICreateSliderEditorBlock,
  IUpdateSliderEditorBlock,
  ICreateSliderTemplateSet,
  IUpdateSliderTemplateSet,
  ICreateSliderTemplate,
  IUpdateSliderTemplate,
} from "@/types";

// Deck
export const createSliderDeck = async (
  deck: ICreateSliderDeck,
): Promise<SliderDeck> => invoke("slider:create-deck", deck);

export const updateSliderDeck = async (
  deck: IUpdateSliderDeck,
): Promise<SliderDeck> => invoke("slider:update-deck", deck);

export const deleteSliderDeck = async (id: number): Promise<void> =>
  invoke("slider:delete-deck", id);

export const getSliderDeck = async (id: number): Promise<SliderDeck> =>
  invoke("slider:get-deck", id);

export const getAllSliderDecks = async (): Promise<SliderDeck[]> =>
  invoke("slider:get-all-decks");

// Page
export const createSliderPage = async (
  page: ICreateSliderPage,
): Promise<SliderPage> => invoke("slider:create-page", page);

export const updateSliderPage = async (
  page: IUpdateSliderPage,
): Promise<SliderPage> => invoke("slider:update-page", page);

export const deleteSliderPage = async (id: number): Promise<void> =>
  invoke("slider:delete-page", id);

export const getSliderPage = async (id: number): Promise<SliderPage> =>
  invoke("slider:get-page", id);

export const getSliderPagesByDeck = async (
  deckId: number,
): Promise<SliderPage[]> => invoke("slider:get-pages-by-deck", deckId);

export const reorderSliderPages = async (
  deckId: number,
  orderedPageIds: number[],
): Promise<boolean> => invoke("slider:reorder-pages", deckId, orderedPageIds);

// Editor Blocks
export const createSliderEditorBlock = async (
  block: ICreateSliderEditorBlock,
): Promise<SliderEditorBlock> => invoke("slider:create-editor", block);

export const updateSliderEditorBlock = async (
  block: IUpdateSliderEditorBlock,
): Promise<SliderEditorBlock> => invoke("slider:update-editor", block);

export const deleteSliderEditorBlock = async (id: number): Promise<void> =>
  invoke("slider:delete-editor", id);

export const getSliderEditorsByPage = async (
  pageId: number,
): Promise<SliderEditorBlock[]> => invoke("slider:get-editors-by-page", pageId);

// Template Set
export const createSliderTemplateSet = async (
  set: ICreateSliderTemplateSet,
): Promise<SliderTemplateSet> => invoke("slider:create-template-set", set);

export const updateSliderTemplateSet = async (
  set: IUpdateSliderTemplateSet,
): Promise<SliderTemplateSet> => invoke("slider:update-template-set", set);

export const deleteSliderTemplateSet = async (id: number): Promise<void> =>
  invoke("slider:delete-template-set", id);

export const getAllSliderTemplateSets = async (): Promise<
  SliderTemplateSet[]
> => invoke("slider:get-all-template-sets");
// Template
export const createSliderTemplate = async (
  tpl: ICreateSliderTemplate,
): Promise<SliderTemplate> => invoke("slider:create-template", tpl);

export const updateSliderTemplate = async (
  tpl: IUpdateSliderTemplate,
): Promise<SliderTemplate> => invoke("slider:update-template", tpl);

export const deleteSliderTemplate = async (id: number): Promise<void> =>
  invoke("slider:delete-template", id);

export const getSliderTemplatesBySet = async (
  setId: number,
): Promise<SliderTemplate[]> => invoke("slider:get-templates-by-set", setId);
