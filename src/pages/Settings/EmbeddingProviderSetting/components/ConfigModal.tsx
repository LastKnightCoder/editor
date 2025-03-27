import { Flex, Input, Modal } from "antd";
import { useEffect, useState } from "react";
import { ConfigFormData, ConfigItem } from "../types";

const MODAL_ITEM_WIDTH = 80;

interface ConfigModalProps {
  action?: "create" | "edit";
  onFinish: (data: ConfigFormData) => void;
  onCancel: () => void;
  initialData?: ConfigItem;
}

const ConfigModal = ({
  action,
  onFinish,
  onCancel,
  initialData,
}: ConfigModalProps) => {
  const [editName, setEditName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");

  useEffect(() => {
    if (initialData && action) {
      setEditName(initialData.name);
      setEditApiKey(initialData.apiKey);
      setEditBaseUrl(initialData.baseUrl);
    }
  }, [initialData, action]);

  const handleFinish = () => {
    onFinish({
      name: editName,
      apiKey: editApiKey,
      baseUrl: editBaseUrl,
      id: initialData?.id,
    });
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
  };

  const handleCancel = () => {
    onCancel();
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
  };

  const isEdit = action === "edit";

  return (
    <Modal
      open={!!action}
      onOk={handleFinish}
      onCancel={handleCancel}
      okText={isEdit ? "保存" : "添加"}
      cancelText={"取消"}
      title={isEdit ? "编辑配置" : "添加配置"}
    >
      <Flex vertical gap={12} style={{ padding: 24 }}>
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>名称：</div>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </Flex>
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>API Key：</div>
          <Input.Password
            value={editApiKey}
            onChange={(e) => setEditApiKey(e.target.value)}
          />
        </Flex>
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>
            Base URL：
          </div>
          <Input
            value={editBaseUrl}
            onChange={(e) => setEditBaseUrl(e.target.value)}
          />
        </Flex>
      </Flex>
    </Modal>
  );
};

export default ConfigModal;
