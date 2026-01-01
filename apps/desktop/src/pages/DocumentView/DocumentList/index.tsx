import { memo } from "react";
import Document from "./Document";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

const DocumentList = memo(() => {
  const { id } = useTabParams(TabType.DocumentDetail);

  return (
    <div className="px-4 h-full overflow-y-auto border-t-16 border-b-16 border-transparent box-border [&::-webkit-scrollbar]:hidden">
      <Document documentId={Number(id)} key={Number(id)} />
    </div>
  );
});

export default DocumentList;
