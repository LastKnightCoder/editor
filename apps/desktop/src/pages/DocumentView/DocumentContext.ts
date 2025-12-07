import { createContext, useContext } from "react";

export const DocumentContext = createContext<{
  documentId: number;
  itemId?: number;
}>({
  documentId: 0,
  itemId: undefined,
});

export const useDocumentContext = () => {
  return useContext(DocumentContext);
};

export default DocumentContext;
