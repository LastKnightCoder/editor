import WhiteBoard from "@/components/WhiteBoard";
import useEditWhiteBoard from "./useEditWhiteBoard";
import { useEffect, useState } from "react";
import { useRafInterval } from "ahooks";
import { Empty, Skeleton, App, Input, Modal } from "antd";
import { WhiteBoardContent as IWhiteBoardContent } from "@/types";
import styles from "./index.module.less";
import { PlusOutlined } from "@ant-design/icons";
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
  } = useEditWhiteBoard(whiteBoardId);
  const { message } = App.useApp();

  const [addSubWhiteBoardModalOpen, setAddSubWhiteBoardModalOpen] =
    useState(false);
  const [modalName, setModalName] = useState("");

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

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100%" }}>
        <Skeleton active />
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
          style={{ width: "100%", height: "100%" }}
          initData={activeSubWhiteBoard.data.children}
          initViewPort={activeSubWhiteBoard.data.viewPort}
          initSelection={activeSubWhiteBoard.data.selection}
          initPresentationSequences={
            activeSubWhiteBoard.data.presentationSequences || []
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
      >
        <Input
          placeholder="请输入子白板名称"
          value={modalName}
          onChange={(e) => setModalName(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default WhiteBoardContent;
