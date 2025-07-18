import WhiteBoard from "@/components/WhiteBoard";
import useEditWhiteBoard from "./useEditWhiteBoard";
import { useEffect, useState } from "react";
import { useRafInterval } from "ahooks";
import { Empty, App, Input, Modal } from "antd";
import { WhiteBoardContent as IWhiteBoardContent } from "@/types";
import styles from "./index.module.less";
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
    <div className={styles.contentContainer}>
      <div className={styles.whiteBoardWrapper}>
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
        />
      </div>
      <div className={styles.subWhiteBoardList}>
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
          className={styles.plusButton}
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
