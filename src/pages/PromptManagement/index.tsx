import { memo, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Tooltip,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";

import usePromptStore from "@/stores/usePromptStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import type { Prompt } from "@/types";

const PromptManagement = memo(() => {
  const { message, modal } = App.useApp();
  const isConnected = useDatabaseConnected();
  const database = useSettingStore((state) => state.setting.database.active);
  const [form] = Form.useForm();

  const {
    prompts,
    loading,
    initPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
  } = usePromptStore(
    useShallow((state) => ({
      prompts: state.prompts,
      loading: state.loading,
      initPrompts: state.initPrompts,
      createPrompt: state.createPrompt,
      updatePrompt: state.updatePrompt,
      deletePrompt: state.deletePrompt,
    })),
  );

  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (isConnected) {
      initPrompts();
    }
  }, [initPrompts, isConnected, database]);

  const openCreateModal = useMemoizedFn(() => {
    setEditingPrompt(null);
    form.resetFields();
    setModalVisible(true);
  });

  const openEditModal = useMemoizedFn((prompt: Prompt) => {
    setEditingPrompt(prompt);
    form.setFieldsValue({
      name: prompt.name,
      tags: prompt.tags.join(", "),
      content: prompt.content,
    });
    setModalVisible(true);
  });

  const handleDelete = useMemoizedFn((prompt: Prompt) => {
    modal.confirm({
      title: "删除 Prompt",
      content: `确认删除「${prompt.name}」吗？`,
      okButtonProps: { danger: true },
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        await deletePrompt(prompt.id);
        message.success("删除成功");
      },
    });
  });

  const handleSubmit = useMemoizedFn(async () => {
    const values = await form.validateFields();
    const tags = values.tags
      ? values.tags
          .split(",")
          .map((tag: string) => tag.trim())
          .filter(Boolean)
      : [];
    const payload = {
      name: values.name.trim(),
      tags,
      content: values.content.trim(),
    };

    if (editingPrompt) {
      await updatePrompt({ id: editingPrompt.id, ...payload });
      message.success("已更新 Prompt");
    } else {
      await createPrompt(payload);
      message.success("已创建 Prompt");
    }

    setModalVisible(false);
    setEditingPrompt(null);
    form.resetFields();
  });

  const sortedPrompts = useMemo(() => {
    return [...prompts].sort((a, b) => b.updateTime - a.updateTime);
  }, [prompts]);

  return (
    <div className="h-full w-full flex flex-col bg-primary-bg overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
        <div>
          <div className="text-lg font-semibold">Prompt 管理</div>
          <div className="text-xs text-text-secondary">
            管理可复用的系统 Prompt，便于快速切换对话基调
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
        >
          新建 Prompt
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {sortedPrompts.length === 0 && !loading ? (
          <div className="h-full flex items-center justify-center">
            <Empty
              description="还没有 Prompt"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={openCreateModal}>
                立即创建
              </Button>
            </Empty>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {sortedPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="border border-[#f0f0f0] dark:border-[#2a2a2a] rounded-2xl p-4 bg-white dark:bg-[#1f1f1f] shadow-sm flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-lg font-semibold leading-tight">
                    {prompt.name}
                  </div>
                  <Space size={4}>
                    <Tooltip title="编辑">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(prompt)}
                        className="hover:!bg-gray-100 dark:hover:!bg-gray-800"
                      />
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(prompt)}
                        className="hover:!bg-red-50 dark:hover:!bg-red-900/20"
                      />
                    </Tooltip>
                  </Space>
                </div>

                <div className="flex flex-wrap gap-1">
                  {prompt.tags.length > 0 ? (
                    prompt.tags.map((tag) => (
                      <Tag key={tag} color="blue">
                        {tag}
                      </Tag>
                    ))
                  ) : (
                    <Tag color="default">未添加标签</Tag>
                  )}
                </div>

                <div
                  className="text-sm text-text-secondary"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                  title={prompt.content}
                >
                  {prompt.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        title={editingPrompt ? "编辑 Prompt" : "新建 Prompt"}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false);
          setEditingPrompt(null);
        }}
        okText={editingPrompt ? "保存" : "创建"}
        cancelText="取消"
        confirmLoading={loading}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: "请输入名称" }]}
          >
            <Input placeholder="例如：代码助手" />
          </Form.Item>
          <Form.Item label="标签" name="tags">
            <Input placeholder="使用英文逗号分隔多个标签" />
          </Form.Item>
          <Form.Item
            label="Prompt 内容"
            name="content"
            rules={[{ required: true, message: "请输入 Prompt 内容" }]}
          >
            <Input.TextArea rows={6} placeholder="输入系统 Prompt 内容" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

export default PromptManagement;
