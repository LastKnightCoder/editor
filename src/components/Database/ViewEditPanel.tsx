import React, { memo, useState, useEffect } from "react";
import { Input, Form, Radio, Select, Space, Button } from "antd";
import { DataTableView, DataTableViewType } from "@/types";
import { ColumnDef, GalleryViewConfig } from "./types";
import { useMemoizedFn } from "ahooks";

interface ViewEditPanelProps {
  view: DataTableView | null;
  columns: ColumnDef[];
  onConfirm: (
    viewId: number,
    name: string,
    type: DataTableViewType,
    galleryConfig?: GalleryViewConfig,
  ) => void;
  onClose: () => void;
}

const ViewEditPanel: React.FC<ViewEditPanelProps> = memo(
  ({ view, columns, onConfirm, onClose }) => {
    const [form] = Form.useForm<{
      name: string;
      type: DataTableViewType;
      coverType: "detail" | "image";
      coverImageColumnId?: string;
    }>();

    const [viewType, setViewType] = useState<DataTableViewType>("table");

    useEffect(() => {
      if (view) {
        const galleryConfig = view.config.galleryConfig;
        form.setFieldsValue({
          name: view.name,
          type: view.type,
          coverType: galleryConfig?.coverType || "detail",
          coverImageColumnId: galleryConfig?.coverImageColumnId,
        });
        setViewType(view.type);
      }
    }, [view, form]);

    const handleOk = useMemoizedFn(async () => {
      if (!view) return;
      try {
        const values = await form.validateFields();
        const galleryConfig: GalleryViewConfig | undefined =
          values.type === "gallery"
            ? {
                coverType: values.coverType,
                coverImageColumnId: values.coverImageColumnId,
              }
            : undefined;

        onConfirm(view.id, values.name, values.type, galleryConfig);
        onClose();
      } catch (error) {
        console.error("表单验证失败:", error);
      }
    });

    const imageColumns = columns.filter((col) => col.type === "image");

    if (!view) return null;

    return (
      <div style={{ width: "320px", padding: "16px" }}>
        <Form form={form} layout="vertical">
          <Form.Item
            label="视图名称"
            name="name"
            rules={[{ required: true, message: "请输入视图名称" }]}
          >
            <Input placeholder="请输入视图名称" maxLength={50} />
          </Form.Item>

          <Form.Item label="视图类型" name="type">
            <Radio.Group onChange={(e) => setViewType(e.target.value)}>
              <Space direction="vertical">
                <Radio value="table">表格</Radio>
                <Radio value="gallery">画廊</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {viewType === "gallery" && (
            <>
              <Form.Item label="封面类型" name="coverType">
                <Radio.Group>
                  <Space direction="vertical">
                    <Radio value="detail">详情</Radio>
                    <Radio value="image" disabled={imageColumns.length === 0}>
                      图片
                      {imageColumns.length === 0 && (
                        <span style={{ color: "#8c8c8c", fontSize: "12px" }}>
                          {" "}
                          （无图片列）
                        </span>
                      )}
                    </Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>

              <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) =>
                  getFieldValue("coverType") === "image" &&
                  imageColumns.length > 0 ? (
                    <Form.Item label="图片列" name="coverImageColumnId">
                      <Select
                        placeholder="选择图片列"
                        options={imageColumns.map((col) => ({
                          label: col.title,
                          value: col.id,
                        }))}
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </>
          )}

          <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button size="small" onClick={onClose}>
                取消
              </Button>
              <Button type="primary" size="small" onClick={handleOk}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>
    );
  },
);

ViewEditPanel.displayName = "ViewEditPanel";

export default ViewEditPanel;
