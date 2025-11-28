import { invoke } from "@/electron";
import {
  Epub,
  CreateEpub,
  EpubAnnotation,
  CreateEpubAnnotation,
  EpubBookmark,
  CreateEpubBookmark,
} from "@/types";

// ==================== EPUB CRUD ====================

export const createEpub = async (epub: CreateEpub): Promise<Epub> => {
  return await invoke("create-epub", epub);
};

export const updateEpub = async (epub: Epub): Promise<Epub> => {
  return await invoke("update-epub", epub);
};

export const getEpubById = async (id: number): Promise<Epub> => {
  return await invoke("get-epub-by-id", id);
};

export const getEpubList = async (): Promise<Epub[]> => {
  return await invoke("get-epub-list");
};

export const removeEpub = async (id: number): Promise<number> => {
  return await invoke("delete-epub", id);
};

export const updateEpubProgress = async (params: {
  id: number;
  progressCfi: string;
  progressPercentage: number;
}): Promise<Epub> => {
  return await invoke("update-epub-progress", params);
};

// ==================== Annotation CRUD ====================

export const addEpubAnnotation = async (
  annotation: CreateEpubAnnotation,
): Promise<EpubAnnotation> => {
  return await invoke("add-epub-annotation", annotation);
};

export const updateEpubAnnotation = async (
  annotation: EpubAnnotation,
): Promise<EpubAnnotation> => {
  return await invoke("update-epub-annotation", annotation);
};

export const getEpubAnnotations = async (
  epubId: number,
): Promise<EpubAnnotation[]> => {
  return await invoke("get-epub-annotations", epubId);
};

export const removeEpubAnnotation = async (id: number): Promise<number> => {
  return await invoke("delete-epub-annotation", id);
};

// ==================== Bookmark CRUD ====================

export const addEpubBookmark = async (
  bookmark: CreateEpubBookmark,
): Promise<EpubBookmark> => {
  return await invoke("add-epub-bookmark", bookmark);
};

export const updateEpubBookmark = async (
  bookmark: EpubBookmark,
): Promise<EpubBookmark> => {
  return await invoke("update-epub-bookmark", bookmark);
};

export const getEpubBookmarks = async (
  epubId: number,
): Promise<EpubBookmark[]> => {
  return await invoke("get-epub-bookmarks", epubId);
};

export const removeEpubBookmark = async (id: number): Promise<number> => {
  return await invoke("delete-epub-bookmark", id);
};
