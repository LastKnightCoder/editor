import { useState, useEffect } from "react";
import { Modal } from "antd";
import { WhiteBoard, WhiteBoardContent } from "@/types";
import { getAllWhiteBoards } from "@/commands/white-board";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import { LoadingOutlined } from "@ant-design/icons";

interface ISelectWhiteBoardContentModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (whiteBoardContent: WhiteBoardContent) => Promise<void>;
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
    // 使用第一个 WhiteBoardContent
    if (
      whiteBoard.whiteBoardContentList &&
      whiteBoard.whiteBoardContentList.length > 0
    ) {
      await onOk(whiteBoard.whiteBoardContentList[0]);
      setSelectedWhiteBoards([]);
    }
  };

  const handleCancel = () => {
    setSelectedWhiteBoards([]);
    onCancel();
  };

  if (loading) {
    return (
      <Modal open={open} onCancel={handleCancel} footer={null}>
        <div style={{ textAlign: "center", padding: "40px" }}>
          <LoadingOutlined spin />
        </div>
      </Modal>
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
