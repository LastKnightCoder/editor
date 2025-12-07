import { useState, useEffect } from "react";
import { WhiteBoard, WhiteBoardContent } from "../../../types";
import { CustomModal } from "@tau/shared";
import { LoadingOutlined } from "@ant-design/icons";
import { Editor } from "slate";

interface ISelectWhiteBoardContentModalProps {
  editor: Editor
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
  const { open, onCancel, onOk, editor } = props;
  const [loading, setLoading] = useState(false);
  const [allWhiteBoards, setAllWhiteBoards] = useState<WhiteBoard[]>([]);
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<WhiteBoard[]>(
    [],
  );

  const WhiteBoardSelectModal = editor.services?.components?.WhiteBoardSelectModal;

  useEffect(() => {
    if (open) {
      setLoading(true);
      editor.services?.whiteboard.getAll()
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
    // 使用 WhiteBoard 的 content 作为 WhiteBoardContent
    const whiteBoardContent: WhiteBoardContent = {
      id: whiteBoard.id,
      name: whiteBoard.name,
      content: whiteBoard.content,
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
    WhiteBoardSelectModal ? (
      <WhiteBoardSelectModal
        open={open}
        title="选择要引用的白板"
        multiple={false}
        onCancel={handleCancel}
        onChange={setSelectedWhiteBoards}
        onOk={handleOk}
        selectedWhiteBoards={selectedWhiteBoards}
        allWhiteBoards={allWhiteBoards}
      />
    ) : null
  );
};

export default SelectWhiteBoardContentModal;
