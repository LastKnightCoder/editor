import { memo } from "react";
import EditDoc from "./EditDoc";
import useDocumentsStore from "@/stores/useDocumentsStore";

const EditDocumentItem = memo(() => {
  const activeDocumentItemId = useDocumentsStore(
    (state) => state.activeDocumentItemId,
  );

  if (!activeDocumentItemId) return null;

  return <EditDoc key={activeDocumentItemId} />;
});

export default EditDocumentItem;
