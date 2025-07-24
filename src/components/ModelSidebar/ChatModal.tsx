import React, { useEffect } from "react";
import { Modal, Form, Input, message } from "antd";
import { ChatMessage } from "@/types/chat-message";

interface ChatModalProps {
  open: boolean;
  action: "create" | "edit";
  initialData?: ChatMessage;
  onFinish: (data: { title: string; id?: number }) => void;
  onCancel: () => void;
}

const ChatModal: React.FC<ChatModalProps> = ({
  open,
  action,
  initialData,
  onFinish,
  onCancel,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (action === "edit" && initialData) {
        form.setFieldsValue({
          title: initialData.title,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, action, initialData, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onFinish({
        title: values.title,
        id: initialData?.id,
      });
      form.resetFields();
    } catch (error) {
      message.error("请填写完整信息");
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={action === "create" ? "新建对话" : "编辑对话"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={action === "create" ? "创建" : "保存"}
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="title"
          label="对话标题"
          rules={[{ required: true, message: "请输入对话标题" }]}
        >
          <Input placeholder="请输入对话标题" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ChatModal;
