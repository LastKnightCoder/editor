import { create } from 'zustand';
import { IDocument, ICreateDocument, IUpdateDocument, IDeleteDocument, IDocumentItem } from "@/types";
import {
  getAllDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
} from '@/commands';
import { produce } from "immer";

interface IState {
  documents: IDocument[];
  loading: boolean;
  activeDocumentId: number | null;
  activeDocumentItemId: number | null;
  activeDocumentItem: IDocumentItem | null;
  activeDocumentItemPath: number[];
}

interface IActions {
  init: () => Promise<void>;
  createDocument: (document: ICreateDocument) => Promise<number>;
  updateDocument: (document: IUpdateDocument) => Promise<number>;
  deleteDocument: (document: IDeleteDocument) => Promise<number>;
  addDocumentItem: (documentId: number, documentItemId: number) => void;
}

const initState: IState = {
  documents: [],
  loading: false,
  activeDocumentId: null,
  activeDocumentItemId: null,
  activeDocumentItem: null,
  activeDocumentItemPath: [],
}

const useDocumentsStore = create<IState & IActions>((set, get) => ({
  ...initState,
  init: async () => {
    set({ loading: true });
    const documents = await getAllDocuments();
    set({ documents, loading: false });
  },
  createDocument: async (document) => {
    const res = await createDocument(document);
    const documents = await getAllDocuments();
    set({ documents });
    return res;
  },
  updateDocument: async (document) => {
    const res = await updateDocument(document);
    const documents = await getAllDocuments();
    set({ documents });
    return res;
  },
  deleteDocument: async (id) => {
    const res = await deleteDocument(id);
    const documents = await getAllDocuments();
    set({ documents });
    return res;
  },
  addDocumentItem: async (documentId, documentItemId) => {
    const { documents, updateDocument } = get();
    const document = documents.find((item) => item.id === documentId);
    if (!document) return;
    const newDocument = produce(document, (draft) => {
      draft.children.push(documentItemId);
    });
    await updateDocument(newDocument);
  }
}));

export default useDocumentsStore;