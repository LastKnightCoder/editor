import {
  Modal,
  List,
  Switch,
  Typography,
  Tag,
  Tabs,
  Form,
  Input,
  Button,
  Space,
  Popconfirm,
  Divider,
  message,
} from "antd";
import React, { useEffect, useState } from "react";
import useMCPStore, { CustomMCPServer } from "@/stores/useMCPStore";
import { MCP_PROVIDERS } from "@/mcp/providers";

interface MCPManagerModalProps {
  open: boolean;
  onClose: () => void;
}

const MCPManagerModal: React.FC<MCPManagerModalProps> = ({ open, onClose }) => {
  const providerStates = useMCPStore((state) => state.providerStates);
  const customServers = useMCPStore((state) => state.customServers);
  const setProviderEnabled = useMCPStore((state) => state.setProviderEnabled);
  const addCustomServer = useMCPStore((state) => state.addCustomServer);
  const updateCustomServer = useMCPStore((state) => state.updateCustomServer);
  const removeCustomServer = useMCPStore((state) => state.removeCustomServer);
  const setCustomServerEnabled = useMCPStore(
    (state) => state.setCustomServerEnabled,
  );

  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editingServer, setEditingServer] = useState<CustomMCPServer | null>(
    null,
  );

  useEffect(() => {
    if (editingServer) {
      editForm.setFieldsValue({
        name: editingServer.name,
        baseUrl: editingServer.baseUrl,
        description: editingServer.description,
        apiKey: editingServer.apiKey,
      });
    } else {
      editForm.resetFields();
    }
  }, [editingServer, editForm]);

  const handleAddServer = async () => {
    try {
      const values = await addForm.validateFields();
      addCustomServer(values);
      message.success("已添加自定义 MCP 服务");
      addForm.resetFields();
    } catch {
      // ignore
    }
  };

  const handleEditSave = async () => {
    if (!editingServer) return;
    try {
      const values = await editForm.validateFields();
      updateCustomServer(editingServer.id, values);
      message.success("已更新 MCP 服务配置");
      setEditingServer(null);
    } catch {
      // ignore
    }
  };

  const builtinList = (
    <>
      <Typography.Paragraph type="secondary">
        选择要启用的内置 MCP 服务，启用后模型即可自动调用相应的工具完成任务。
      </Typography.Paragraph>
      <List
        itemLayout="horizontal"
        dataSource={MCP_PROVIDERS}
        renderItem={(provider) => {
          const enabled =
            providerStates[provider.id]?.enabled ??
            provider.defaultEnabled ??
            false;
          return (
            <List.Item
              key={provider.id}
              actions={[
                <Switch
                  key="switch"
                  checked={enabled}
                  onChange={(checked) =>
                    setProviderEnabled(provider.id, checked)
                  }
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <div className="flex items-center gap-2">
                    <span>{provider.name}</span>
                    {enabled ? (
                      <Tag color="blue">已启用</Tag>
                    ) : (
                      <Tag>未启用</Tag>
                    )}
                  </div>
                }
                description={
                  <Typography.Paragraph className="mb-0" ellipsis={{ rows: 2 }}>
                    {provider.description}
                  </Typography.Paragraph>
                }
              />
            </List.Item>
          );
        }}
      />
    </>
  );

  const customList = (
    <>
      <Typography.Paragraph type="secondary">
        你可以在此连接第三方 MCP Server。服务器需提供 <code>/tools</code> 与{" "}
        <code>/tools/:name/invoke</code> 接口，并返回标准的工具定义。
      </Typography.Paragraph>

      <Form
        form={addForm}
        layout="vertical"
        onFinish={handleAddServer}
        requiredMark={false}
      >
        <Form.Item
          label="名称"
          name="name"
          rules={[{ required: true, message: "请输入服务名称" }]}
        >
          <Input placeholder="例如：我的知识库 MCP" />
        </Form.Item>
        <Form.Item
          label="Base URL"
          name="baseUrl"
          rules={[{ required: true, message: "请输入服务 Base URL" }]}
        >
          <Input placeholder="https://example.com/api/mcp" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="可选描述，帮助记忆用途" />
        </Form.Item>
        <Form.Item label="API Key" name="apiKey">
          <Input.Password placeholder="如果服务需要鉴权，请填写 API Key" />
        </Form.Item>
        <Button type="primary" onClick={handleAddServer} block>
          添加自定义 MCP
        </Button>
      </Form>

      <Divider />

      <List
        locale={{ emptyText: "尚未添加自定义 MCP 服务" }}
        dataSource={customServers}
        renderItem={(server) => (
          <List.Item
            key={server.id}
            actions={[
              <Switch
                key="toggle"
                checked={server.enabled}
                onChange={(checked) =>
                  setCustomServerEnabled(server.id, checked)
                }
              />,
              <Button
                key="edit"
                type="link"
                onClick={() => setEditingServer(server)}
              >
                编辑
              </Button>,
              <Popconfirm
                key="remove"
                title="删除 MCP 服务"
                description="确定删除该 MCP 配置吗？"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => {
                  removeCustomServer(server.id);
                  message.success("已删除 MCP 服务");
                }}
              >
                <Button type="link" danger>
                  删除
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space size="small">
                  <span>{server.name}</span>
                  {server.enabled ? (
                    <Tag color="blue">已启用</Tag>
                  ) : (
                    <Tag>未启用</Tag>
                  )}
                </Space>
              }
              description={
                <div>
                  <div className="truncate text-xs text-gray-500">
                    {server.baseUrl}
                  </div>
                  {server.description && (
                    <Typography.Paragraph className="mb-0 text-xs text-gray-500">
                      {server.description}
                    </Typography.Paragraph>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </>
  );

  return (
    <Modal
      title="MCP 管理中心"
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      <Tabs
        defaultActiveKey="builtin"
        items={[
          { key: "builtin", label: "内置服务", children: builtinList },
          { key: "custom", label: "自定义 MCP", children: customList },
        ]}
      />

      <Modal
        title="编辑 MCP 服务"
        open={Boolean(editingServer)}
        onCancel={() => setEditingServer(null)}
        onOk={handleEditSave}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" requiredMark={false}>
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: "请输入服务名称" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Base URL"
            name="baseUrl"
            rules={[{ required: true, message: "请输入 Base URL" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="API Key" name="apiKey">
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
};

export default MCPManagerModal;
