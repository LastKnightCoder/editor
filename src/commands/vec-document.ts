import { invoke } from '@/electron';
import { VecDocument } from '@/types';

export const createVecDocument = async (createVecDocument: Omit<VecDocument, 'id' | 'createTime' | 'updateTime'>): Promise<VecDocument> => {
  return await invoke('create-vec-document', createVecDocument);
}

export const getVecDocumentById = async (id: number): Promise<VecDocument> => {
  return await invoke('get-vec-document-by-id', id);
}

export const getVecDocumentsByRef = async (refId: number, refType: string): Promise<VecDocument[]> => {
  return await invoke('get-vec-documents-by-ref', refId, refType);
}

export const getVecDocumentsByRefType = async (refType: string): Promise<VecDocument[]> => {
  return await invoke('get-vec-documents-by-ref-type', refType);
}

export const deleteVecDocument = async (id: number): Promise<number> => {
  return await invoke('delete-vec-document', id);
}

export const deleteVecDocumentsByRef = async (refId: number, refType: string): Promise<void> => {
  return await invoke('delete-vec-documents-by-ref', refId, refType);
}

export const getAllVecDocuments = async (): Promise<VecDocument[]> => {
  return await invoke('get-all-vec-documents');
}

export const updateVecDocument = async (updateVecDocument: Omit<VecDocument, 'updateTime'>): Promise<VecDocument> => {
  return await invoke('update-vec-document', updateVecDocument);
}

export const searchVecDocuments = async (queryEmbedding: number[], topK: number): Promise<Array<[VecDocument, number]>> => {
  return await invoke('search-vec-documents', queryEmbedding, topK);
}
