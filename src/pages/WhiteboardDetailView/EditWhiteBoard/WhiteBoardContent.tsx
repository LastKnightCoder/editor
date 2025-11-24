import WhiteBoard from "@/components/WhiteBoard";
import useEditWhiteBoard from "./useEditWhiteBoard";
import { useEffect, useState } from "react";
import { useRafInterval } from "ahooks";
import { Empty, App, Input, Modal } from "antd";
import { WhiteBoardContent as IWhiteBoardContent } from "@/types";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import SubWhiteBoardItem from "./SubWhiteBoardItem";

interface WhiteBoardContentProps {
  whiteBoardId: number;
}

const WhiteBoardContent = (props: WhiteBoardContentProps) => {
  const { whiteBoardId } = props;

  const {
    loading,
    whiteBoard,
    activeSubWhiteBoard,
    onSubWhiteBoardContentChange,
    saveSubWhiteBoard,
    onAddSubWhiteBoard,
    onDeleteSubWhiteBoard,
    changeSubWhiteBoard,
    onUpdateSubWhiteBoardName,
  } = useEditWhiteBoard(whiteBoardId);
  const { message } = App.useApp();

  const [addSubWhiteBoardModalOpen, setAddSubWhiteBoardModalOpen] =
    useState(false);
  const [modalName, setModalName] = useState("");

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<IWhiteBoardContent | null>(null);
  const [editName, setEditName] = useState("");

  useRafInterval(() => {
    saveSubWhiteBoard();
  }, 3000);

  useEffect(() => {
    return () => {
      saveSubWhiteBoard();
    };
  }, [saveSubWhiteBoard]);

  const handleAddSubWhiteBoard = () => {
    if (!modalName) {
      message.error("请输入子白板名称");
      return;
    }
    const emptyWhiteBoardData: IWhiteBoardContent["data"] = {
      children: [],
      viewPort: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        minX: 0,
        minY: 0,
        zoom: 1,
      },
      selection: {
        selectArea: null,
        selectedElements: [],
      },
      presentationSequences: [],
    };
    onAddSubWhiteBoard(modalName, emptyWhiteBoardData);
    setAddSubWhiteBoardModalOpen(false);
    setModalName("");
  };

  const handleEditSubWhiteBoard = (item: IWhiteBoardContent) => {
    setEditItem(item);
    setEditName(item.name);
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editItem) return;
    if (!editName) {
      message.error("请输入子白板名称");
      return;
    }
    onUpdateSubWhiteBoardName(editItem.id, editName);
    setEditModalOpen(false);
    setEditItem(null);
    setEditName("");
  };

  if (loading) {
    return (
      <div className="w-full h-full flex justify-center items-center">
        <LoadingOutlined className="text-2xl" />
      </div>
    );
  }

  if (!whiteBoard) {
    return null;
  }

  if (!activeSubWhiteBoard) {
    return <Empty description="请选择一个白板" />;
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <WhiteBoard
          key={activeSubWhiteBoard.id}
          className="w-full h-full"
          initData={activeSubWhiteBoard.data.children}
          initViewPort={activeSubWhiteBoard.data.viewPort}
          initSelection={activeSubWhiteBoard.data.selection}
          initPresentationSequences={
            activeSubWhiteBoard.data.presentationSequences
          }
          onChange={onSubWhiteBoardContentChange}
          whiteboardContentId={activeSubWhiteBoard.id}
        />
      </div>

      {/* 底部的子白板列表 */}
      <div className="h-10 shrink-0 flex items-center border-t border-[#f0f0f0] dark:border-[#2a2a2a] overflow-x-auto px-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-track]:bg-[var(--scrollbar-track)] [&::-webkit-scrollbar-track]:rounded">
        {whiteBoard.whiteBoardContentList.map((item) => (
          <SubWhiteBoardItem
            key={item.id}
            item={item}
            isActive={activeSubWhiteBoard.id === item.id}
            onItemClick={changeSubWhiteBoard}
            onDelete={onDeleteSubWhiteBoard}
            onEdit={handleEditSubWhiteBoard}
          />
        ))}
        <PlusOutlined
          className="min-w-[40px] h-9 rounded flex items-center justify-center cursor-pointer flex-shrink-0 ml-1 bg-transparent border-none text-[var(--text-secondary)] hover:bg-[var(--background-tertiary)] hover:text-[var(--primary-color)] transition-colors"
          onClick={() => setAddSubWhiteBoardModalOpen(true)}
        />
      </div>

      <Modal
        open={addSubWhiteBoardModalOpen}
        onCancel={() => {
          setAddSubWhiteBoardModalOpen(false);
          setModalName("");
        }}
        onOk={() => handleAddSubWhiteBoard()}
        title="新建子白板"
      >
        <Input
          placeholder="请输入子白板名称"
          value={modalName}
          onChange={(e) => setModalName(e.target.value)}
        />
      </Modal>
      <Modal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditItem(null);
          setEditName("");
        }}
        onOk={handleSaveEdit}
        title="编辑子白板"
      >
        <Input
          placeholder="请输入子白板名称"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default WhiteBoardContent;
