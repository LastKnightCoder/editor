import { Flex, Input, Modal, Select } from "antd";
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

const featureOptions = [
  { label: "联网", value: "online" },
  { label: "思考", value: "thinking" },
  { label: "多模态", value: "multimodal" },
];

const ModelModal = ({
  open,
  onFinish,
  onCancel,
  initialData,
  action = "create",
}: ModelModalProps) => {
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  useEffect(() => {
    if (initialData && open) {
      setModelName(initialData.name);
      setDescription(initialData.description);
      const initialFeatures = Object.entries(
        initialData.features || {
          online: false,
          thinking: false,
          multimodal: false,
        },
      )
        .filter(([, value]) => value)
        .map(([key]) => key);
      setSelectedFeatures(initialFeatures);
    }
  }, [initialData, open]);

  const handleFinish = () => {
    const features = {
      online: selectedFeatures.includes("online"),
      thinking: selectedFeatures.includes("thinking"),
      multimodal: selectedFeatures.includes("multimodal"),
    };
    onFinish({
      name: modelName,
      description,
      features,
    });
    setModelName("");
    setDescription("");
    setSelectedFeatures([]);
  };

  const handleCancel = () => {
    onCancel();
    setModelName("");
    setDescription("");
    setSelectedFeatures([]);
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
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>
            支持的特性：
          </div>
          <Select
            mode="multiple"
            style={{ width: "100%" }}
            options={featureOptions}
            value={selectedFeatures}
            onChange={setSelectedFeatures}
          />
        </Flex>
      </Flex>
    </Modal>
  );
};

export default ModelModal;
