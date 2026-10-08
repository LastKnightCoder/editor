import { useState } from "react";
import { FileText } from "lucide-react";
import { ChromeButton, ECreateBoardElementType, useBoard } from "@tau/whiteboard";
import { DocumentSelectorModal } from "../../Document/DocumentSelectorModal";

const DocumentTool = () => {
  const board = useBoard();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ChromeButton
        label="文档"
        onClick={() => {
          board.currentCreateType = ECreateBoardElementType.Document;
          setOpen(true);
        }}
      >
        <FileText strokeWidth={1.75} />
      </ChromeButton>
      <DocumentSelectorModal open={open} onClose={() => setOpen(false)} board={board} />
    </>
  );
};

export default DocumentTool;
