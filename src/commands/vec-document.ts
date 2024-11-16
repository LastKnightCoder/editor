import { invoke } from '@tauri-apps/api';
import { VecDocument } from '@/types';

const transformVecDocument = (vecDocument: any): VecDocument => {
  return {
    ...vecDocument,
    createTime: vecDocument.create_time,
    updateTime: vecDocument.update_time,
    refId: vecDocument.ref_id,
    refUpdateTime: vecDocument.ref_update_time,
    refType: vecDocument.ref_type,
  };
};

export const createVecDocument = async (createVecDocument: Omit<VecDocument, 'id' | 'createTime' | 'updateTime'>) => {
  const res: any = await invoke('plugin:vec_document|create_vec_document', createVecDocument);
  return transformVecDocument(res);
}

export const getVecDocumentById = async (id: number): Promise<VecDocument> => {
  const res: any = await invoke('plugin:vec_document|get_vec_document_by_id', { id });
  return transformVecDocument(res);
}

export const getVecDocumentsByRef = async (refId: number, refType: string): Promise<VecDocument[]> => {
  const res: any[] = await invoke('plugin:vec_document|get_vec_documents_by_ref', { refId, refType });
  return res.map(transformVecDocument);
}

export const getVecDocumentsByRefType = async (refType: string): Promise<VecDocument[]> => {
  const res: any[] = await invoke('plugin:vec_document|get_vec_documents_by_ref_type', { refType });
  return res.map(transformVecDocument);
}

export const deleteVecDocument = async (id: number): Promise<number> => {
  return await invoke('plugin:vec_document|delete_vec_document', { id });
}

export const deleteVecDocumentsByRef = async (refId: number, refType: string): Promise<void> => {
  return await invoke('plugin:vec_document|delete_vec_documents_by_ref', { refId, refType });
}

export const getAllVecDocuments = async (): Promise<VecDocument[]> => {
  const res: any[] = await invoke('plugin:vec_document|get_all_vec_documents');
  return res.map(transformVecDocument);
}

export const updateVecDocument = async (updateVecDocument: Omit<VecDocument, 'updateTime'>): Promise<VecDocument> => {
  const res: any = await invoke('plugin:vec_document|update_vec_document', updateVecDocument);
  return transformVecDocument(res);
}

export const searchVecDocuments = async (queryEmbedding: number[], topK: number): Promise<Array<[VecDocument, number]>> => {
  const res: any[] = await invoke('plugin:vec_document|search_vec_documents', { queryEmbedding, topK });
  return res.map(item => [transformVecDocument(item[0]), item[1]]);
}
