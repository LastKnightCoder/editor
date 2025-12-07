import { invoke } from "@/electron";
import {
  IDocument,
  ICreateDocument,
  IUpdateDocument,
  IDeleteDocument,
  ICreateDocumentItem,
  IDeleteDocumentItem,
  IUpdateDocumentItem,
  IDocumentItem,
} from "@/types";

export const createDocument = async (
  document: ICreateDocument,
): Promise<IDocument> => {
  return await invoke("create-document", document);
};

export const updateDocument = async (
  document: IUpdateDocument,
): Promise<IDocument> => {
  return await invoke("update-document", document);
};

export const deleteDocument = async (
  document: IDeleteDocument,
): Promise<number> => {
  return await invoke("delete-document", document.id);
};

export const getDocument = async (id: number): Promise<IDocument> => {
  return await invoke("get-document", id);
};

export const getAllDocuments = async (): Promise<IDocument[]> => {
  return await invoke("get-all-documents");
};

export const addRootDocumentItem = async (
  documentId: number,
  documentItem: ICreateDocumentItem,
): Promise<[IDocument, IDocumentItem | null] | null> => {
  return await invoke("add-root-document-item", documentId, documentItem);
};

export const addChildDocumentItem = async (
  parentDocumentItemId: number,
  documentItem: ICreateDocumentItem,
): Promise<[IDocumentItem | null, IDocumentItem | null] | null> => {
  return await invoke(
    "add-child-document-item",
    parentDocumentItemId,
    documentItem,
  );
};

export const addRefRootDocumentItem = async (
  documentId: number,
  documentItemId: number,
): Promise<[IDocument, IDocumentItem | null] | null> => {
  return await invoke("add-ref-root-document-item", documentId, documentItemId);
};

export const addRefChildDocumentItem = async (
  parentDocumentItemId: number,
  documentItemId: number,
): Promise<[IDocumentItem | null, IDocumentItem | null] | null> => {
  return await invoke(
    "add-ref-child-document-item",
    parentDocumentItemId,
    documentItemId,
  );
};

export const removeRootDocumentItem = async (
  documentId: number,
  documentItemId: number,
  notDelete?: boolean,
): Promise<[IDocument, IDocumentItem | null] | null> => {
  return await invoke(
    "remove-root-document-item",
    documentId,
    documentItemId,
    notDelete,
  );
};

export const removeChildDocumentItem = async (
  documentId: number,
  parentDocumentItemId: number,
  documentItemId: number,
  notDelete?: boolean,
): Promise<[IDocumentItem | null, IDocumentItem | null] | null> => {
  return await invoke(
    "remove-child-document-item",
    documentId,
    parentDocumentItemId,
    documentItemId,
    notDelete,
  );
};

export const updateDocumentItem = async (
  updateDoc: IUpdateDocumentItem,
): Promise<IDocumentItem | null> => {
  return await invoke("update-document-item", updateDoc);
};

export const deleteDocumentItem = async (
  documentItem: IDeleteDocumentItem,
): Promise<number> => {
  return await invoke("delete-document-item", documentItem.id);
};

export const getDocumentItem = async (
  id: number,
): Promise<IDocumentItem | null> => {
  return await invoke("get-document-item", id);
};

export const getDocumentItemsByIds = async (
  ids: number[],
): Promise<IDocumentItem[]> => {
  return await invoke("get-document-items-by-ids", ids);
};

export const getAllDocumentItems = async (): Promise<IDocumentItem[]> => {
  return await invoke("get-all-document-items");
};

export const isDocumentItemChildOf = async (
  id: number,
  parentId: number,
): Promise<boolean> => {
  return await invoke("is-document-item-child-of", id, parentId);
};

export const initAllDocumentItemParents = async (): Promise<void> => {
  await invoke("init-all-document-item-parents");
};

export const initDocumentItemParentsByIds = async (
  ids: number[],
): Promise<void> => {
  await invoke("init-document-item-parents-by-ids", ids);
};

export const getDocumentItemAllParents = async (
  id: number,
): Promise<number[]> => {
  return await invoke("get-document-item-all-parents", id);
};

export const getRootDocumentsByDocumentItemId = async (
  id: number,
): Promise<IDocument[]> => {
  return await invoke("get-root-documents-by-document-item-id", id);
};

export const openDocumentItemInNewWindow = (
  databaseName: string,
  documentItemId: number,
) => {
  return invoke(
    "open-document-item-in-new-window",
    databaseName,
    documentItemId,
    {
      showTitlebar: true,
      isDefaultTop: true,
    },
  );
};
