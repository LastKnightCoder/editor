import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import { Button, Flex, Input, Modal, Space, Table, TableColumnsType, App, Tag, Divider } from "antd";
import { useState } from "react";
import { current, produce } from "immer";
import { v4 as getUuid } from 'uuid';

const MODAL_ITEM_WIDTH = 100;

const DoubaoSetting = () => {
  const {
    settings
  } = useSettingStore(state => ({
    settings: state.setting.llmProviders[ELLMProvider.DOUBAO]
  }));

  const {
    configs,
    currentConfigId
  } = settings;

  const { message, modal } = App.useApp();

  const [action, setAction] = useState<'create' | 'edit'>();
  const [editName, setEditName] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editId, setEditId] = useState('');

  const [modelAddOpen, setModelAddOpen] = useState(false);
  const [editModelName, setEditModelName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const currentConfig = configs.find(item => item.id === currentConfigId);

  const onAddConfig = () => {
    setAction('create');
    setEditName('');
    setEditApiKey('');
    setEditBaseUrl('');
    setEditId('');
  }

  const handleEditConfigFinish = () => {
    if (!action) return;
    if (action === 'create') {
      useSettingStore.setState(produce(draft => {
        draft.setting.llmProviders[ELLMProvider.DOUBAO].configs.push({
          id: getUuid(),
          name: editName,
          apiKey: editApiKey,
          baseUrl: editBaseUrl
        });
      }))
    } else {
      useSettingStore.setState(produce(draft => {
        const index = draft.setting.llmProviders[ELLMProvider.DOUBAO].configs.findIndex((item: any) => item.id === editId);
        if (index === -1) {
          return;
        }
        draft.setting.llmProviders[ELLMProvider.DOUBAO].configs[index] = {
          id: editId,
          name: editName,
          apiKey: editApiKey,
          baseUrl: editBaseUrl
        };
      }));
    }
    setAction(undefined);
    setEditName('');
    setEditApiKey('');
    setEditBaseUrl('');
    setEditId('');
  }

  const handleEditConfigCancel = () => {
    setAction(undefined);
    setEditName('');
    setEditApiKey('');
    setEditBaseUrl('');
    setEditId('');
  }

  const onDeleteConfig = (id: string) => {
    modal.confirm({
      title: '确定删除此模型吗？',
      onOk: () => {
        useSettingStore.setState(produce(draft => {
          const index = draft.setting.llmProviders[ELLMProvider.DOUBAO].configs.findIndex((item: any) => item.id === id);
          if (index === -1) {
            return;
          }
          draft.setting.llmProviders[ELLMProvider.DOUBAO].configs.splice(index, 1);
        }));
      }
    })
  }

  const onEditConfig = (item: any) => {
    setAction('edit');
    setEditName(item.name);
    setEditApiKey(item.apiKey);
    setEditBaseUrl(item.baseUrl);
    setEditId(item.id);
  }

  const onActivateConfig = (id: string) => {
    useSettingStore.setState(produce(draft => {
      draft.setting.llmProviders[ELLMProvider.DOUBAO].currentConfigId = id;
    }));
  }

  const columns: TableColumnsType<typeof configs[0]> = [{
    title: '名称',
    dataIndex: 'name',
    key: 'name',
    ellipsis: true,
    width: 120
  }, {
    title: 'API Key',
    dataIndex: 'apiKey',
    key: 'apiKey',
    ellipsis: true,
    render: (_text, _record) => (
      <div>********</div>
    ),
    width: 120
  }, {
    title: 'Base URL',
    dataIndex: 'baseUrl',
    key: 'baseUrl',
    ellipsis: true,
    width: 120
  }, {
    title: '状态',
    render: (_text, record) => {
      const isActive = record.id === currentConfigId;
      return (
        <Tag color={isActive ? 'green' : 'default'}>
          { isActive ? '使用中' : '未使用'}
        </Tag>
      )
    },
    width: 80
  }, {
    title: '操作',
    key: 'action',
    render: (_text, record) => (
      <Flex>
        <Button size={'small'} disabled={record.id === currentConfigId} type={'link'} onClick={() => onActivateConfig(record.id)}>启动</Button>
        <Button size={'small'} type="link" onClick={() => onEditConfig(record)}>编辑</Button>
        <Button size={'small'} danger type="link" onClick={() => onDeleteConfig(record.id)}>删除</Button>
      </Flex>
    ),
  }];

  const onAddModel = () => {
    setModelAddOpen(true);
    setEditModelName('');
    setEditDescription('');
  }

  const onActivateModel = (name: string) => {
    useSettingStore.setState(produce(draft => {
      const index = draft.setting.llmProviders[ELLMProvider.DOUBAO].configs.findIndex((item: any) => item.id === currentConfigId);
      if (index !== -1) {
        draft.setting.llmProviders[ELLMProvider.DOUBAO].configs[index].currentModel = name;
      }
    }))
  }

  const onDeleteModel = (name: string) => {
    modal.confirm({
      title: '确定删除此模型吗？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      },
      onOk: () => {
        useSettingStore.setState(produce(draft => {
          const currentConfig = draft.setting.llmProviders[ELLMProvider.DOUBAO].configs.find((item: any) => item.id === currentConfigId);
          if (currentConfig) {
            currentConfig.models = currentConfig.models.filter((item: any) => item.name !== name);
          }
        }))
      }
    })
  }

  const onAddModelFinish = () => {
    if (!editModelName || !editDescription) {
      message.warning('请填写完整');
      return;
    }
    useSettingStore.setState(produce(draft => {
      const currentConfig = draft.setting.llmProviders[ELLMProvider.DOUBAO].configs.find((item: any) => item.id === currentConfigId);
      console.log(current(currentConfig));
      if (currentConfig) {
        if (currentConfig.models) {
          currentConfig.models.push({
            name: editModelName,
            description: editDescription
          })
        } else {
          currentConfig.models = [{
            name: editModelName,
            description: editDescription
          }];
        }
      }
    }));
    setModelAddOpen(false);
    setEditModelName('');
    setEditDescription('');
  }

  const onAddModelCancel = () => {
    setModelAddOpen(false);
    setEditModelName('');
    setEditDescription('');
  }

  const modelColumns: TableColumnsType<typeof configs[0]['models'][0]> = [{
    title: '模型名称',
    dataIndex: 'name',
    key: 'name',
  }, {
    title: '模型描述',
    dataIndex: 'description',
    key: 'description',
  }, {
    title: '状态',
    render: (_text, record) => {
      const isActive = record.name === currentConfig?.currentModel;
      return (
        <Tag color={isActive ? 'green' : 'default'}>
          { isActive ? '使用中' : '未使用'}
        </Tag>
      )
    }
  }, {
    title: '操作',
    key: 'action',
    render: (_text, record) => (
      <Flex gap={12}>
        <Button disabled={record.name === currentConfig?.currentModel} type="link" onClick={() => onActivateModel(record.name)}>启动</Button>
        <Button danger type="link" onClick={() => onDeleteModel(record.name)}>删除</Button>
      </Flex>
    ),
  }];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={onAddConfig}>添加配置</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={configs}
        pagination={false}
      />
      {
        currentConfig && (
          <div>
            <Divider>模型列表</Divider>
            <Flex vertical gap={12}>
              <div><Button onClick={onAddModel}>添加模型</Button></div>
              <Table
                columns={modelColumns}
                dataSource={currentConfig.models}
                pagination={false}
              />
            </Flex>
          </div>
        )
      }
      <Modal
        open={!!action}
        onOk={handleEditConfigFinish}
        onCancel={handleEditConfigCancel}
        okText={action === 'create' ? '添加' : '保存'}
        cancelText={'取消'}
        title={action === 'create' ? '添加配置' : '编辑配置'}
      >
        <Flex vertical gap={12}>
          <Flex gap={12} align={'center'}>
            <div style={{ flex: 'none', width: MODAL_ITEM_WIDTH }}>配置名称：</div>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </Flex>
          <Flex gap={12} align={'center'}>
            <div style={{ flex: 'none', width: MODAL_ITEM_WIDTH }}>API Key：</div>
            <Input.Password
              value={editApiKey}
              onChange={(e) => setEditApiKey(e.target.value)}
            />
          </Flex>
          <Flex gap={12} align={'center'}>
            <div style={{ flex: 'none', width: MODAL_ITEM_WIDTH }}>Base URL：</div>
            <Input
              value={editBaseUrl}
              onChange={(e) => setEditBaseUrl(e.target.value)}
            />
          </Flex>
        </Flex>
      </Modal>
      <Modal
        open={modelAddOpen}
        okText={'添加'}
        title={'添加模型'}
        onOk={onAddModelFinish}
        onCancel={onAddModelCancel}
      >
        <Flex gap={12} vertical>
          <Flex gap={12} align={'center'}>
            <div style={{ flex: 'none', width: MODAL_ITEM_WIDTH }}>模型名称：</div>
            <Input
              value={editModelName}
              onChange={(e) => setEditModelName(e.target.value)}
            />
          </Flex>
          <Flex gap={12} align={'center'}>
            <div style={{ flex: 'none', width: MODAL_ITEM_WIDTH }}>模型描述：</div>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </Flex>
        </Flex>
      </Modal>
    </div>
  )
}

export default DoubaoSetting;
