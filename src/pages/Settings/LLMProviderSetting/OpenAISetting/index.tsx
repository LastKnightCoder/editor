import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import {
  Button,
  Flex,
  Input,
  Modal,
  Space,
  Table,
  TableColumnsType,
  App,
  Tag,
  Divider,
} from "antd";
import { useState } from "react";
import { produce } from "immer";
import { v4 as getUuid } from "uuid";

const OPENAI_MODELS = [
  {
    name: "gpt-3.5-turbo",
    description: "gpt-3.5-turbo",
    features: {
      online: false,
      thinking: false,
      multimodal: false,
    },
  },
  {
    name: "gpt-4",
    description: "gpt-4",
    features: {
      online: false,
      thinking: false,
      multimodal: false,
    },
  },
  {
    name: "gpt-4-turbo",
    description: "gpt-4-turbo",
    features: {
      online: false,
      thinking: false,
      multimodal: false,
    },
  },
  {
    name: "gpt-4o",
    description: "gpt-4o",
    features: {
      online: false,
      thinking: false,
      multimodal: true,
    },
  },
  {
    name: "gpt-4o-mini",
    description: "gpt-4o-mini",
    features: {
      online: false,
      thinking: false,
      multimodal: false,
    },
  },
  {
    name: "gpt-o1-preview",
    description: "gpt-o1-preview",
    features: {
      online: false,
      thinking: true,
      multimodal: false,
    },
  },
  {
    name: "gpt-o1-mini",
    description: "gpt-o1-mini",
    features: {
      online: false,
      thinking: true,
      multimodal: false,
    },
  },
];

const MODAL_ITEM_WIDTH = 80;

const OpenAISetting = () => {
  const { settings } = useSettingStore((state) => ({
    settings: state.setting.llmProviders[ELLMProvider.OPENAI],
  }));

  const { configs, currentConfigId } = settings;

  const { modal } = App.useApp();

  const [action, setAction] = useState<"create" | "edit">();

  const [editName, setEditName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editId, setEditId] = useState("");

  const currentConfig = configs.find((item) => item.id === currentConfigId);

  const onAddConfig = () => {
    setAction("create");
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
    setEditId("");
  };

  const handleEditConfigFinish = () => {
    if (!action) return;
    if (action === "create") {
      useSettingStore.setState(
        produce((draft) => {
          draft.setting.llmProviders[ELLMProvider.OPENAI].configs.push({
            id: getUuid(),
            name: editName,
            apiKey: editApiKey,
            baseUrl: editBaseUrl,
          });
        }),
      );
    } else {
      useSettingStore.setState(
        produce((draft) => {
          const index = draft.setting.llmProviders[
            ELLMProvider.OPENAI
          ].configs.findIndex((item: any) => item.id === editId);
          if (index === -1) {
            return;
          }
          draft.setting.llmProviders[ELLMProvider.OPENAI].configs[index] = {
            id: editId,
            name: editName,
            apiKey: editApiKey,
            baseUrl: editBaseUrl,
          };
        }),
      );
    }
    setAction(undefined);
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
    setEditId("");
  };

  const handleEditConfigCancel = () => {
    setAction(undefined);
    setEditName("");
    setEditApiKey("");
    setEditBaseUrl("");
    setEditId("");
  };

  const onDeleteModel = (id: string) => {
    modal.confirm({
      title: "确定删除此模型吗？",
      onOk: () => {
        useSettingStore.setState(
          produce((draft) => {
            const index = draft.setting.llmProviders[
              ELLMProvider.OPENAI
            ].configs.findIndex((item: any) => item.id === id);
            if (index === -1) {
              return;
            }
            draft.setting.llmProviders[ELLMProvider.OPENAI].configs.splice(
              index,
              1,
            );
          }),
        );
      },
    });
  };

  const onEditModel = (item: any) => {
    setAction("edit");
    setEditName(item.name);
    setEditApiKey(item.apiKey);
    setEditBaseUrl(item.baseUrl);
    setEditId(item.id);
  };

  const onActivateConfig = (id: string) => {
    useSettingStore.setState(
      produce((draft) => {
        draft.setting.llmProviders[ELLMProvider.OPENAI].currentConfigId = id;
      }),
    );
  };

  const columns: TableColumnsType<(typeof configs)[0]> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: "API Key",
      dataIndex: "apiKey",
      key: "apiKey",
      ellipsis: true,
      render: () => <div>********</div>,
    },
    {
      title: "Base URL",
      dataIndex: "baseUrl",
      key: "baseUrl",
      ellipsis: true,
    },
    {
      title: "状态",
      render: (_text, record) => {
        const isActive = record.id === currentConfigId;
        return (
          <Tag color={isActive ? "green" : "default"}>
            {isActive ? "使用中" : "未使用"}
          </Tag>
        );
      },
    },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      ellipsis: true,
      render: (_text, record) => (
        <Flex>
          <Button
            disabled={record.id === currentConfigId}
            size={"small"}
            type={"link"}
            onClick={() => onActivateConfig(record.id)}
          >
            启动
          </Button>
          <Button
            size={"small"}
            type="link"
            onClick={() => onEditModel(record)}
          >
            编辑
          </Button>
          <Button
            danger
            size={"small"}
            type="link"
            onClick={() => onDeleteModel(record.id)}
          >
            删除
          </Button>
        </Flex>
      ),
    },
  ];

  const onActivateModel = (name: string) => {
    useSettingStore.setState(
      produce((draft) => {
        const index = draft.setting.llmProviders[
          ELLMProvider.OPENAI
        ].configs.findIndex((item: any) => item.id === currentConfigId);
        if (index !== -1) {
          draft.setting.llmProviders[ELLMProvider.OPENAI].configs[
            index
          ].currentModel = name;
        }
      }),
    );
  };

  const modelColumns: TableColumnsType<any> = [
    {
      title: "模型名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "模型描述",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "支持的特性",
      key: "features",
      render: (_text, record) => {
        const features = record.features || {
          online: false,
          thinking: false,
          multimodal: false,
        };
        const featureTags = [];
        if (features.online) featureTags.push(<Tag color="blue">联网</Tag>);
        if (features.thinking) featureTags.push(<Tag color="purple">思考</Tag>);
        if (features.multimodal)
          featureTags.push(<Tag color="orange">多模态</Tag>);
        if (featureTags.length === 0) featureTags.push(<Tag>-</Tag>);
        return <>{featureTags}</>;
      },
    },
    {
      title: "状态",
      render: (_text, record) => {
        const isActive = record.name === currentConfig?.currentModel;
        return (
          <Tag color={isActive ? "green" : "default"}>
            {isActive ? "使用中" : "未使用"}
          </Tag>
        );
      },
    },
    {
      title: "操作",
      key: "action",
      render: (_text, record) => (
        <Flex gap={12}>
          <Button
            disabled={record.name === currentConfig?.currentModel}
            type="link"
            onClick={() => onActivateModel(record.name)}
          >
            启动
          </Button>
        </Flex>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={onAddConfig}>添加配置</Button>
      </Space>
      <Table columns={columns} dataSource={configs} pagination={false} />
      {currentConfig && (
        <div>
          <Divider>模型列表</Divider>
          <Table
            columns={modelColumns}
            dataSource={OPENAI_MODELS}
            pagination={false}
          />
        </div>
      )}
      <Modal
        open={!!action}
        onOk={handleEditConfigFinish}
        onCancel={handleEditConfigCancel}
        okText={action === "create" ? "添加" : "保存"}
        cancelText={"取消"}
        title={action === "create" ? "添加配置" : "编辑配置"}
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
            <div style={{ flex: "none", width: MODAL_ITEM_WIDTH }}>
              API Key：
            </div>
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
    </div>
  );
};

export default OpenAISetting;
