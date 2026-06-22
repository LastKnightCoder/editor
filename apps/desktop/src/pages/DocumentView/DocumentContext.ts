import { createContext, useContext } from "react";

export const DocumentContext = createContext<{
  documentId: number;
  itemId?: number;
  containerWidth?: number;
}>({
  documentId: 0,
  itemId: undefined,
  containerWidth: undefined,
});

export const useDocumentContext = () => {
  return useContext(DocumentContext);
};

export default DocumentContext;
