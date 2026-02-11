import { useState, useEffect } from "react";
import { WhiteBoard, WhiteBoardContent } from "@/types";
import { CustomModal } from "@tau/shared";
import { LoadingOutlined } from "@ant-design/icons";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import { getAllWhiteBoards } from "@/commands/white-board";

interface ISelectWhiteBoardContentModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (
    whiteBoardContent: WhiteBoardContent,
    whiteBoard: WhiteBoard,
  ) => Promise<void>;
}

const SelectWhiteBoardContentModal = (
  props: ISelectWhiteBoardContentModalProps,
) => {
  const { open, onCancel, onOk } = props;
  const [loading, setLoading] = useState(false);
  const [allWhiteBoards, setAllWhiteBoards] = useState<WhiteBoard[]>([]);
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<WhiteBoard[]>(
    [],
  );

  useEffect(() => {
    if (open) {
      setLoading(true);
      getAllWhiteBoards()
        .then((whiteBoards) => {
          setAllWhiteBoards(whiteBoards);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open]);

  const handleOk = async (whiteBoards: WhiteBoard[]) => {
    if (whiteBoards.length === 0) return;
    const whiteBoard = whiteBoards[0];
    const activeContent =
      whiteBoard.whiteBoardContentList.find(
        (item) => item.id === whiteBoard.activeWhiteBoardContentId,
      ) ?? whiteBoard.whiteBoardContentList[0];
    if (!activeContent) {
      return;
    }
    const whiteBoardContent: WhiteBoardContent = {
      id: activeContent.id,
      name: activeContent.name,
      imgUrl: activeContent.imgUrl || "",
      createTime: activeContent.createTime,
      updateTime: activeContent.updateTime,
      data: activeContent.data,
    };
    await onOk(whiteBoardContent, whiteBoard);
    setSelectedWhiteBoards([]);
  };

  const handleCancel = () => {
    setSelectedWhiteBoards([]);
    onCancel();
  };

  if (loading) {
    return (
      <CustomModal open={open} onCancel={handleCancel} footer={null}>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <LoadingOutlined spin />
        </div>
      </CustomModal>
    );
  }

  return (
    <SelectWhiteBoardModal
      open={open}
      title="选择要引用的白板"
      multiple={false}
      onCancel={handleCancel}
      onChange={setSelectedWhiteBoards}
      onOk={handleOk}
      selectedWhiteBoards={selectedWhiteBoards}
      allWhiteBoards={allWhiteBoards}
    />
  );
};

export default SelectWhiteBoardContentModal;
