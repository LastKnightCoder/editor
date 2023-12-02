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
    ...item,
    content: JSON.parse(item.content),
    isDelete: item.is_delete,
    createTime: item.create_time,
    updateTime: item.update_time,
    bannerBg: item.banner_bg,
    isTop: item.is_top,
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
