import WhiteBoard from "@/components/WhiteBoard";
import useEditWhiteBoard from "./useEditWhiteBoard";
import { useEffect, useState } from "react";
import { useRafInterval } from "ahooks";
import { Empty } from "antd";
import { WhiteBoardContent as IWhiteBoardContent } from "@/types";
import { Loader2, Plus } from "lucide-react";
import SubWhiteBoardItem from "./SubWhiteBoardItem";
import EditTitleModal from "@/components/EditTitleModal";

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

  const [addSubWhiteBoardModalOpen, setAddSubWhiteBoardModalOpen] =
    useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<IWhiteBoardContent | null>(null);

  useRafInterval(() => {
    saveSubWhiteBoard();
  }, 3000);

  useEffect(() => {
    return () => {
      saveSubWhiteBoard();
    };
  }, [saveSubWhiteBoard]);

  const handleAddSubWhiteBoard = (result: { title: string }) => {
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
    onAddSubWhiteBoard(result.title, emptyWhiteBoardData);
    setAddSubWhiteBoardModalOpen(false);
  };

  const handleEditSubWhiteBoard = (item: IWhiteBoardContent) => {
    setEditItem(item);
    setEditModalOpen(true);
  };

  const handleSaveEdit = (result: { title: string }) => {
    if (!editItem) return;
    onUpdateSubWhiteBoardName(editItem.id, result.title);
    setEditModalOpen(false);
    setEditItem(null);
  };

  if (loading) {
    return (
      <div className="w-full h-full flex justify-center items-center">
        <Loader2 className="text-2xl animate-spin" />
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
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 overflow-x-auto backdrop-blur-md bg-[rgba(248,250,255,0.7)] dark:bg-[rgba(10,15,28,0.7)] border-t border-[rgba(15,23,42,0.08)] dark:border-[rgba(255,255,255,0.08)] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-[rgba(15,23,42,0.2)] dark:[&::-webkit-scrollbar-thumb]:bg-[rgba(255,255,255,0.2)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
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
        <div
          className="min-w-[32px] h-8 rounded-xl flex items-center justify-center cursor-pointer shrink-0 text-[rgba(15,23,42,0.6)] dark:text-[rgba(241,245,249,0.6)] hover:bg-[rgba(255,255,255,0.5)] dark:hover:bg-[rgba(148,163,184,0.12)] hover:text-[rgba(15,23,42,0.95)] dark:hover:text-[rgba(248,250,252,0.95)] transition-all duration-150"
          onClick={() => setAddSubWhiteBoardModalOpen(true)}
        >
          <Plus size={20} />
        </div>
      </div>

      <EditTitleModal
        open={addSubWhiteBoardModalOpen}
        onCancel={() => setAddSubWhiteBoardModalOpen(false)}
        onConfirm={handleAddSubWhiteBoard}
        initialTitle=""
        modalTitle="新建子白板"
        modalDescription="输入子白板名称"
        placeholder="请输入子白板名称"
      />
      <EditTitleModal
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditItem(null);
        }}
        onConfirm={handleSaveEdit}
        initialTitle={editItem?.name || ""}
        modalTitle="编辑子白板"
        modalDescription="修改子白板名称"
        placeholder="请输入子白板名称"
      />
    </div>
  );
};

export default WhiteBoardContent;
