import { invoke } from '@tauri-apps/api';
import {
  IDocument,
  ICreateDocument,
  IUpdateDocument,
  IDeleteDocument,
  ICreateDocumentItem,
  IDeleteDocumentItem,
  IUpdateDocumentItem,
  IDocumentItem
} from '@/types';

export const createDocument = async (document: ICreateDocument): Promise<number> => {
  return await invoke('create_document', {
    ...document,
    content: JSON.stringify(document.content),
  });
}

export const updateDocument = async (document: IUpdateDocument): Promise<number> => {
  return await invoke('update_document', {
    ...document,
    content: JSON.stringify(document.content),
  });
}

export const deleteDocument = async (document: IDeleteDocument): Promise<number> => {
  return await invoke('delete_document', {
    ...document,
  });
}

export const getDocument = async (id: number): Promise<IDocument> => {
  const document: any =  await invoke('get_document', {
    id
  });

  return {
    ...document,
    content: JSON.parse(document.content),
    isDelete: document.is_delete,
    createTime: document.create_time,
    updateTime: document.update_time,
    bannerBg: document.banner_bg,
    isTop: document.is_top,
  }
}

export const getAllDocuments = async (): Promise<IDocument[]> => {
  const list: any[] = await invoke('get_document_list');
  return list.map((item) => ({
    ...item.document,
    count: item.count,
    content: JSON.parse(item.document.content),
    isDelete: item.document.is_delete,
    createTime: item.document.create_time,
    updateTime: item.document.update_time,
    bannerBg: item.document.banner_bg,
    isTop: item.document.is_top,
  }));
}

export const createDocumentItem = async (documentItem: ICreateDocumentItem): Promise<number> => {
  return await invoke('create_document_item', {
    ...documentItem,
    content: JSON.stringify(documentItem.content),
  });
}

export const updateDocumentItem = async (updateDoc: IUpdateDocumentItem): Promise<IDocumentItem> => {
  const documentItem: any = await invoke('update_document_item', {
    ...updateDoc,
    content: JSON.stringify(updateDoc.content),
  });

  return {
    ...documentItem,
    content: JSON.parse(documentItem.content),
    isDelete: documentItem.is_delete,
    createTime: documentItem.create_time,
    updateTime: documentItem.update_time,
    bannerBg: documentItem.banner_bg,
    isDirectory: documentItem.is_directory,
    isArticle: documentItem.is_article,
    isCard: documentItem.is_card,
    articleId: documentItem.article_id,
    cardId: documentItem.card_id,
  }
}

export const deleteDocumentItem = async (documentItem: IDeleteDocumentItem): Promise<number> => {
  return await invoke('delete_document_item', {
    ...documentItem,
  });
}

export const getDocumentItem = async (id: number): Promise<IDocumentItem> => {
  const documentItem: any =  await invoke('get_document_item', {
    id
  });

  return {
    ...documentItem,
    content: JSON.parse(documentItem.content),
    isDelete: documentItem.is_delete,
    createTime: documentItem.create_time,
    updateTime: documentItem.update_time,
    bannerBg: documentItem.banner_bg,
    isDirectory: documentItem.is_directory,
    isArticle: documentItem.is_article,
    isCard: documentItem.is_card,
    articleId: documentItem.article_id,
    cardId: documentItem.card_id,
  }
}

export const getDocumentItemsByIds = async (ids: number[]): Promise<IDocumentItem[]> => {
  const list: any[] = await invoke('get_document_items_by_ids', {
    ids
  });

  return list.map((item) => ({
    ...item,
    content: JSON.parse(item.content),
    isDelete: item.is_delete,
    createTime: item.create_time,
    updateTime: item.update_time,
    bannerBg: item.banner_bg,
    isDirectory: item.is_directory,
    isArticle: item.is_article,
    isCard: item.is_card,
    articleId: item.article_id,
    cardId: item.card_id,
  }));
}

export const getAllDocumentItems = async (): Promise<IDocumentItem[]> => {
  const list: any[] = await invoke('get_all_document_items');
  return list.map((item) => ({
    ...item,
    content: JSON.parse(item.content),
    isDelete: item.is_delete,
    createTime: item.create_time,
    updateTime: item.update_time,
    bannerBg: item.banner_bg,
    isDirectory: item.is_directory,
    isArticle: item.is_article,
    isCard: item.is_card,
    articleId: item.article_id,
    cardId: item.card_id,
  }));
}

export const isDocumentItemChildOf = async (id: number, parentId: number): Promise<boolean> => {
  return await invoke('is_document_item_child_of', {
    id,
    parentId
  });
}

export const initAllDocumentItemParents = async (): Promise<void> => {
  await invoke('init_all_document_item_parents');
}

export const initDocumentItemParentsByIds = async (ids: number[]): Promise<void> => {
  await invoke('init_document_item_parents_by_ids', {
    ids
  });
}

export const getDocumentItemAllParents = async (id: number): Promise<number[]> => {
  return await invoke('get_document_item_all_parents', {
    id
  });
}