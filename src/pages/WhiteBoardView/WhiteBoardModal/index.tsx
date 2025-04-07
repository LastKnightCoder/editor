import React, { useState, useEffect } from "react";
import { App, Flex, Input, Modal } from "antd";

interface WhiteBoardModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (title: string, description: string) => Promise<void>;
  initialData?: {
    title: string;
    description: string;
  };
  modalTitle: string;
  okText: string;
}

const WhiteBoardModal: React.FC<WhiteBoardModalProps> = ({
  open,
  onCancel,
  onOk,
  initialData,
  modalTitle,
  okText,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { message } = App.useApp();

  useEffect(() => {
    if (open && initialData) {
      setTitle(initialData.title);
      setDescription(initialData.description);
    } else if (!open) {
      setTitle("");
      setDescription("");
    }
  }, [open, initialData]);

  const handleOk = async () => {
    if (!title) {
      message.error("请输入标题");
      return;
    }
    if (!description) {
      message.error("请输入描述");
      return;
    }

    try {
      await onOk(title, description);
    } catch (error) {
      console.error("操作失败:", error);
      message.error("操作失败");
    }
  };

  return (
    <Modal
      closeIcon={null}
      title={modalTitle}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText={okText}
      cancelText="取消"
    >
      <Flex gap={"middle"} vertical>
        <Flex gap={"middle"} align={"center"}>
          <p style={{ flex: "none", margin: 0 }}>标题：</p>
          <Input
            placeholder="请输入标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Flex>
        <Flex gap={"middle"} align={"start"}>
          <p style={{ flex: "none", margin: 0 }}>描述：</p>
          <Input.TextArea
            placeholder="请输入描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Flex>
      </Flex>
    </Modal>
  );
};

export default WhiteBoardModal;
