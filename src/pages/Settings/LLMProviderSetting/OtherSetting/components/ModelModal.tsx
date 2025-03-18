import { Flex, Input, Modal } from "antd";
import { useEffect, useState } from "react";
import { ModelFormData, ModelItem } from "../types";

const MODAL_ITEM_WIDTH = 100;

interface ModelModalProps {
  open: boolean;
  onFinish: (data: ModelFormData) => void;
  onCancel: () => void;
  initialData?: ModelItem;
  action?: "create" | "edit";
}

const ModelModal = ({
  open,
  onFinish,
  onCancel,
  initialData,
  action = "create",
}: ModelModalProps) => {
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (initialData && open) {
      setModelName(initialData.name);
      setDescription(initialData.description);
    }
  }, [initialData, open]);

  const handleFinish = () => {
    onFinish({
      name: modelName,
      description,
    });
    setModelName("");
    setDescription("");
  };

  const handleCancel = () => {
    onCancel();
    setModelName("");
    setDescription("");
  };

  const isEdit = action === "edit";

  return (
    <Modal
      open={open}
      okText={isEdit ? "保存" : "添加"}
      title={isEdit ? "编辑模型" : "添加模型"}
      onOk={handleFinish}
      onCancel={handleCancel}
    >
      <Flex gap={12} vertical>
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>
            模型名称：
          </div>
          <Input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          />
        </Flex>
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>
            模型描述：
          </div>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Flex>
      </Flex>
    </Modal>
  );
};

export default ModelModal;
