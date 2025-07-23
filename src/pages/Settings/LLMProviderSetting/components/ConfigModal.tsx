import { Flex, Input, Modal } from "antd";
import { useState, useEffect } from "react";
import { ConfigFormData, ConfigItem } from "../types";

const MODAL_ITEM_WIDTH = 100;

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
    if (initialData && action === "edit") {
      setEditName(initialData.name);
      setEditApiKey(initialData.apiKey);
      setEditBaseUrl(initialData.baseUrl);
    } else {
      setEditName("");
      setEditApiKey("");
      setEditBaseUrl("");
    }
  }, [initialData, action]);

  const handleFinish = () => {
    onFinish({
      name: editName,
      apiKey: editApiKey,
      baseUrl: editBaseUrl,
      id: initialData?.id,
    });
  };

  return (
    <Modal
      open={!!action}
      onOk={handleFinish}
      onCancel={onCancel}
      okText={action === "create" ? "添加" : "保存"}
      cancelText={"取消"}
      title={action === "create" ? "添加配置" : "编辑配置"}
    >
      <Flex vertical gap={12}>
        <Flex gap={12} align={"center"}>
          <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>
            配置名称：
          </div>
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
