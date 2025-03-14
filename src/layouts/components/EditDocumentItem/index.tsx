import { memo } from "react";
import EditDoc from "./EditDoc";
import useDocumentsStore from "@/stores/useDocumentsStore";

const Document = memo(() => {
  const { activeDocumentItem } = useDocumentsStore((state) => ({
    activeDocumentItem: state.activeDocumentItem,
  }));

  if (!activeDocumentItem) return null;

  return <EditDoc key={activeDocumentItem.id} />;
});

export default Document;
