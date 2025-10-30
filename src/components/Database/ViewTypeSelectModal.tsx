import React, { memo, useState } from "react";
import { Modal, Input, Form, Select } from "antd";
import classNames from "classnames";
import { MdTableChart, MdViewModule, MdCalendarToday } from "react-icons/md";
import { DataTableViewType } from "@/types";

interface ViewType {
  type: DataTableViewType | string;
  name: string;
  icon: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

interface ViewTypeSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (
    type: DataTableViewType,
    name: string,
    dateColumnId?: string,
  ) => void;
  columns: Array<{ id: string; title: string; type: string }>;
  theme: "light" | "dark";
}

const ViewTypeSelectModal: React.FC<ViewTypeSelectModalProps> = memo(
  ({ open, onCancel, onConfirm, columns, theme }) => {
    const [selectedType, setSelectedType] = useState<DataTableViewType | null>(
      null,
    );
    const [form] = Form.useForm<{ name: string; dateColumnId?: string }>();

    // 检查是否有日期列
    const dateColumns = columns.filter((col) => col.type === "date");
    const hasDateColumn = dateColumns.length > 0;

    // 动态生成视图类型列表
    const viewTypes: ViewType[] = [
      {
        type: "table",
        name: "表格",
        icon: <MdTableChart />,
      },
      {
        type: "gallery",
        name: "画廊",
        icon: <MdViewModule />,
      },
      {
        type: "calendar",
        name: "日历",
        icon: <MdCalendarToday />,
        disabled: !hasDateColumn,
        disabledReason: "需要至少一个日期列",
      },
    ];

    const handleSelectType = (type: DataTableViewType) => {
      setSelectedType(type);
    };

    const handleOk = async () => {
      if (!selectedType) return;
      try {
        const values = await form.validateFields();
        onConfirm(selectedType, values.name, values.dateColumnId);
        form.resetFields();
        setSelectedType(null);
      } catch (error) {
        console.error("表单验证失败:", error);
      }
    };

    const handleCancel = () => {
      form.resetFields();
      setSelectedType(null);
      onCancel();
    };

    return (
      <Modal
        open={open}
        title="添加新视图"
        onCancel={handleCancel}
        onOk={handleOk}
        okText="创建"
        cancelText="取消"
        width={600}
        okButtonProps={{ disabled: !selectedType }}
      >
        <div className="py-4">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {viewTypes.map((viewType) => (
              <div
                key={viewType.type}
                className={classNames(
                  "flex flex-col items-center justify-center p-6 border-2 rounded-lg transition-all relative",
                  {
                    "bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer":
                      theme === "light" &&
                      !viewType.disabled &&
                      selectedType !== viewType.type,
                    "bg-white border-blue-500 bg-blue-100/50 cursor-pointer":
                      theme === "light" && selectedType === viewType.type,
                    "bg-gray-100 border-gray-300 cursor-not-allowed opacity-50":
                      theme === "light" && viewType.disabled,
                    "bg-[#1f1f1f] border-[#434343] hover:border-[#177ddc] hover:bg-[#177ddc]/10 cursor-pointer":
                      theme === "dark" &&
                      !viewType.disabled &&
                      selectedType !== viewType.type,
                    "bg-[#1f1f1f] border-[#177ddc] bg-[#177ddc]/20 cursor-pointer":
                      theme === "dark" && selectedType === viewType.type,
                    "bg-[#2a2a2a] border-[#434343] cursor-not-allowed opacity-50":
                      theme === "dark" && viewType.disabled,
                  },
                )}
                onClick={() => {
                  if (!viewType.disabled) {
                    handleSelectType(viewType.type as DataTableViewType);
                  }
                }}
                title={viewType.disabled ? viewType.disabledReason : undefined}
              >
                <div
                  className={classNames("text-5xl mb-2", {
                    "text-gray-600": theme === "light" && !viewType.disabled,
                    "text-blue-500":
                      theme === "light" && selectedType === viewType.type,
                    "text-gray-500": theme === "dark" && !viewType.disabled,
                    "text-[#177ddc]":
                      theme === "dark" && selectedType === viewType.type,
                  })}
                >
                  {viewType.icon}
                </div>
                <div
                  className={classNames("text-sm font-medium", {
                    "text-[#2c2c2c]": theme === "light",
                    "text-white": theme === "dark",
                  })}
                >
                  {viewType.name}
                </div>
                {viewType.disabled && viewType.disabledReason && (
                  <div className="text-xs text-gray-500 mt-1 text-center">
                    {viewType.disabledReason}
                  </div>
                )}
              </div>
            ))}
          </div>
          {selectedType && (
            <Form form={form} layout="vertical" className="mt-6">
              <Form.Item
                label="视图名称"
                name="name"
                rules={[{ required: true, message: "请输入视图名称" }]}
                initialValue={
                  viewTypes.find((v) => v.type === selectedType)?.name || ""
                }
              >
                <Input placeholder="请输入视图名称" maxLength={50} />
              </Form.Item>

              {selectedType === "calendar" && (
                <Form.Item
                  label="日期列"
                  name="dateColumnId"
                  rules={[{ required: true, message: "请选择日期列" }]}
                >
                  <Select
                    placeholder="选择用于日历的日期列"
                    options={dateColumns.map((col) => ({
                      label: col.title,
                      value: col.id,
                    }))}
                  />
                </Form.Item>
              )}
            </Form>
          )}
        </div>
      </Modal>
    );
  },
);

ViewTypeSelectModal.displayName = "ViewTypeSelectModal";

export default ViewTypeSelectModal;
