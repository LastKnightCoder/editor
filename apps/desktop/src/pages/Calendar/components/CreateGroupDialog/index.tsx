import { Form, Input } from "antd";
import { useEffect } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import CustomModal from "@/components/CustomModal";

interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateGroupDialog = ({ isOpen, onClose }: CreateGroupDialogProps) => {
  const [form] = Form.useForm();
  const { createCalendarGroup } = useCalendarStore();

  useEffect(() => {
    if (isOpen) {
      form.resetFields();
    }
  }, [isOpen, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await createCalendarGroup({
        name: values.name,
        isSystem: false,
        parentGroupId: null,
        orderIndex: 0,
      });
      onClose();
    } catch (error) {
      console.error("Failed to create group:", error);
    }
  };

  return (
    <CustomModal
      title="创建分组"
      open={isOpen}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="创建"
      cancelText="取消"
      width={400}
    >
      <Form form={form} layout="vertical" size="large">
        <Form.Item
          name="name"
          label="分组名称"
          rules={[{ required: true, message: "请输入分组名称" }]}
        >
          <Input placeholder="输入分组名称" autoFocus />
        </Form.Item>
      </Form>
    </CustomModal>
  );
};

export default CreateGroupDialog;
