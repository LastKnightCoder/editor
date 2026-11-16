import { useState, useEffect } from "react";
import { Whiteboard, WhiteboardContent } from "@/types";
import SelectWhiteboardModal from "@/components/SelectWhiteboardModal";
import { getAllWhiteboards } from "@/commands/white-board";

interface ISelectWhiteboardContentModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (whiteBoardContent: WhiteboardContent, whiteBoard: Whiteboard) => Promise<void>;
}

const SelectWhiteboardContentModal = (props: ISelectWhiteboardContentModalProps) => {
  const { open, onCancel, onOk } = props;
  const [loading, setLoading] = useState(false);
  const [allWhiteboards, setAllWhiteboards] = useState<Whiteboard[]>([]);
  const [selectedWhiteboards, setSelectedWhiteboards] = useState<Whiteboard[]>([]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      getAllWhiteboards()
        .then(whiteBoards => {
          setAllWhiteboards(whiteBoards);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open]);

  const handleOk = async (whiteBoards: Whiteboard[]) => {
    if (whiteBoards.length === 0) return;
    const whiteBoard = whiteBoards[0];
    const activeContent =
      whiteBoard.whiteBoardContentList.find(
        item => item.id === whiteBoard.activeWhiteboardContentId
      ) ?? whiteBoard.whiteBoardContentList[0];
    if (!activeContent) {
      return;
    }
    const whiteBoardContent: WhiteboardContent = {
      id: activeContent.id,
      name: activeContent.name,
      imgUrl: activeContent.imgUrl || "",
      createTime: activeContent.createTime,
      updateTime: activeContent.updateTime,
      data: activeContent.data,
    };
    await onOk(whiteBoardContent, whiteBoard);
    setSelectedWhiteboards([]);
  };

  const handleCancel = () => {
    setSelectedWhiteboards([]);
    onCancel();
  };

  return (
    <SelectWhiteboardModal
      open={open}
      title="选择要引用的白板"
      multiple={false}
      loading={loading}
      onCancel={handleCancel}
      onChange={setSelectedWhiteboards}
      onOk={handleOk}
      selectedWhiteboards={selectedWhiteboards}
      allWhiteboards={allWhiteboards}
    />
  );
};

export default SelectWhiteboardContentModal;
