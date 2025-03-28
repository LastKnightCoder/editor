import { Flex, Input, InputNumber, Modal, Select, App } from "antd";
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

const featureOptions = [{ label: "多模态", value: "multimodal" }];

const ModelModal = ({
  open,
  onFinish,
  onCancel,
  initialData,
  action = "create",
}: ModelModalProps) => {
  const { message } = App.useApp();
  const [modelName, setModelName] = useState("");
  const [description, setDescription] = useState("");
  const [contextLength, setContextLength] = useState<number>(0);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [distance, setDistance] = useState<number>(0.6);
  useEffect(() => {
    if (initialData && open) {
      setModelName(initialData.name);
      setDescription(initialData.description);
      setContextLength(initialData.contextLength || 0);
      setDistance(initialData.distance || 0.6);
      const initialFeatures = Object.entries(
        initialData.features || {
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
      multimodal: selectedFeatures.includes("multimodal"),
    };
    if (contextLength === 0) {
      message.error("上下文长度不能为0");
      return;
    }
    if (distance === 0) {
      message.error("距离阈值不能为0");
      return;
    }
    onFinish({
      name: modelName,
      description,
      contextLength,
      features,
      distance,
    });
    setModelName("");
    setDescription("");
    setContextLength(0);
    setDistance(0.6);
    setSelectedFeatures([]);
  };

  const handleCancel = () => {
    onCancel();
    setModelName("");
    setDescription("");
    setContextLength(0);
    setDistance(0.6);
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
            向量长度：
          </div>
          <InputNumber
            min={1}
            style={{ width: "100%" }}
            value={contextLength}
            onChange={(value) => setContextLength(value || 0)}
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
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>
            距离阈值：
          </div>
          <InputNumber
            min={0}
            style={{ width: "100%" }}
            value={distance}
            onChange={(value) => setDistance(value || 0)}
          />
        </Flex>
      </Flex>
    </Modal>
  );
};

export default ModelModal;
