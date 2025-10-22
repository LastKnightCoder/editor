import { memo, useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  message,
  Space,
  Typography,
  Alert,
} from "antd";
import { useMemoizedFn, useDebounceFn } from "ahooks";
import { searchNotionPages, getNotionPageInfo } from "@/commands/notion";
import { parseNotionBlockId } from "@/utils/notion";
import styles from "./index.module.less";

const { Text } = Typography;

export interface NotionSyncConfig {
  syncMode: "bidirectional" | "json";
  pageId: string;
  pageTitle: string;
  createNew: boolean;
  parentId?: string;
}

interface NotionSyncModalProps {
  open: boolean;
  token: string;
  onOk: (config: NotionSyncConfig) => Promise<void>;
  onCancel: () => void;
  initialConfig?: Partial<NotionSyncConfig>;
}

const NotionSyncModal = memo((props: NotionSyncModalProps) => {
  const { open, token, onOk, onCancel, initialConfig } = props;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pageOptions, setPageOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [syncMode, setSyncMode] = useState<"bidirectional" | "json">(
    initialConfig?.syncMode || "json",
  );
  const [pageInfo, setPageInfo] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pageInfoLoading, setPageInfoLoading] = useState(false);
  const [createMode, setCreateMode] = useState<"existing" | "new">("existing");
  const [parentPageInfo, setParentPageInfo] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [parentSearchLoading, setParentSearchLoading] = useState(false);
  const [parentPageOptions, setParentPageOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        syncMode: initialConfig?.syncMode || "json",
        pageId: initialConfig?.pageId || "",
        pageTitle: initialConfig?.pageTitle || "",
        createMode: "existing",
        parentPageId: "",
      });
      setSyncMode(initialConfig?.syncMode || "json");
      setCreateMode("existing");
      setPageOptions([]);
      setPageInfo(null);
      setParentPageInfo(null);
    }
  }, [open, initialConfig, form]);

  // 处理现有页面输入：自动识别是链接/ID 还是搜索关键词
  const { run: handleInputChange } = useDebounceFn(
    async (input: string) => {
      if (!input || !token) {
        setPageOptions([]);
        setPageInfo(null);
        return;
      }

      // 尝试解析为 Notion 页面 ID
      const pageId = parseNotionBlockId(input);

      if (pageId) {
        // 是有效的页面 ID 或链接，直接获取页面信息
        setPageInfoLoading(true);
        setPageOptions([]);
        try {
          const result = await getNotionPageInfo(token, pageId);
          if (result.success && result.title) {
            const info = {
              id: pageId,
              title: result.title,
            };
            setPageInfo(info);
            // 自动填充表单
            form.setFieldsValue({
              pageId: pageId,
              pageTitle: result.title,
            });
          } else {
            setPageInfo(null);
            message.error(result.error || "获取页面信息失败");
          }
        } catch (error) {
          console.error("获取页面信息失败:", error);
          setPageInfo(null);
        } finally {
          setPageInfoLoading(false);
        }
      } else {
        // 不是有效的 ID，作为搜索关键词处理
        if (input.length < 2) {
          setPageOptions([]);
          return;
        }

        setSearchLoading(true);
        setPageInfo(null);
        try {
          const result = await searchNotionPages(token, input);
          if (result.success && result.pages) {
            setPageOptions(
              result.pages.map((page) => ({
                label: page.title || "无标题",
                value: page.id,
              })),
            );
          }
        } catch (error) {
          console.error("搜索页面失败:", error);
        } finally {
          setSearchLoading(false);
        }
      }
    },
    { wait: 500 },
  );

  // 处理父页面输入：支持链接/ID 和搜索
  const { run: handleParentPageInput } = useDebounceFn(
    async (input: string) => {
      if (!input || !token) {
        setParentPageInfo(null);
        setParentPageOptions([]);
        return;
      }

      const pageId = parseNotionBlockId(input);

      if (pageId) {
        // 是有效的页面 ID 或链接
        setPageInfoLoading(true);
        setParentPageOptions([]);
        try {
          const result = await getNotionPageInfo(token, pageId);
          if (result.success && result.title) {
            setParentPageInfo({
              id: pageId,
              title: result.title,
            });
            form.setFieldsValue({ parentPageId: pageId });
          } else {
            setParentPageInfo(null);
            message.error(result.error || "获取页面信息失败");
          }
        } catch (error) {
          console.error("获取父页面信息失败:", error);
          setParentPageInfo(null);
        } finally {
          setPageInfoLoading(false);
        }
      } else {
        // 作为搜索关键词处理
        if (input.length < 2) {
          setParentPageOptions([]);
          return;
        }

        setParentSearchLoading(true);
        setParentPageInfo(null);
        try {
          const result = await searchNotionPages(token, input);
          if (result.success && result.pages) {
            setParentPageOptions(
              result.pages.map((page) => ({
                label: page.title || "无标题",
                value: page.id,
              })),
            );
          }
        } catch (error) {
          console.error("搜索父页面失败:", error);
        } finally {
          setParentSearchLoading(false);
        }
      }
    },
    { wait: 500 },
  );

  const handleOk = useMemoizedFn(async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (createMode === "new") {
        // 创建新页面模式
        await onOk({
          syncMode: values.syncMode,
          pageId: "", // 新页面模式下 pageId 为空
          pageTitle: values.pageTitle,
          createNew: true,
          parentId: values.parentPageId,
        });
      } else {
        // 关联现有页面模式
        await onOk({
          syncMode: values.syncMode,
          pageId: values.pageId,
          pageTitle: values.pageTitle,
          createNew: false,
        });
      }

      form.resetFields();
    } catch (error: any) {
      console.error("表单验证失败:", error);
      if (error.message) {
        message.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  });

  const handleCancel = useMemoizedFn(() => {
    form.resetFields();
    onCancel();
  });

  return (
    <Modal
      title="Notion 文档同步配置"
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width={600}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert
          message={
            syncMode === "bidirectional"
              ? "双向编辑模式：本地和 Notion 都可编辑，但编辑器功能会受限"
              : "JSON 同步模式：本地支持所有功能，Notion 中显示为代码块"
          }
          type="info"
          showIcon
        />

        <Form form={form} layout="vertical">
          <Form.Item
            label="同步模式"
            name="syncMode"
            rules={[{ required: true, message: "请选择同步模式" }]}
          >
            <Select
              onChange={(value) =>
                setSyncMode(value as "bidirectional" | "json")
              }
            >
              <Select.Option value="json">JSON 同步模式 (推荐)</Select.Option>
              <Select.Option value="bidirectional">
                双向编辑模式 (功能受限)
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="页面模式"
            name="createMode"
            rules={[{ required: true, message: "请选择页面模式" }]}
          >
            <Select
              onChange={(value) => setCreateMode(value as "existing" | "new")}
            >
              <Select.Option value="existing">关联现有页面</Select.Option>
              <Select.Option value="new">创建新页面</Select.Option>
            </Select>
          </Form.Item>

          {createMode === "existing" ? (
            <>
              <Form.Item
                label="Notion 页面"
                name="pageId"
                rules={[
                  {
                    required: true,
                    message: "请输入 Notion 页面链接或搜索页面",
                  },
                ]}
                tooltip="粘贴 Notion 页面链接、页面 ID，或输入关键词搜索"
              >
                <Input.Search
                  placeholder="粘贴 Notion 链接、页面 ID 或搜索页面标题"
                  onChange={(e) => handleInputChange(e.target.value)}
                  loading={pageInfoLoading || searchLoading}
                  allowClear
                  onSearch={(value) => {
                    if (value) {
                      handleInputChange(value);
                    }
                  }}
                />
              </Form.Item>

              {/* 显示解析的页面信息 */}
              {pageInfo && (
                <Alert
                  message="已识别页面"
                  description={
                    <div>
                      <Text strong>{pageInfo.title}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        ID: {pageInfo.id}
                      </Text>
                    </div>
                  }
                  type="success"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}

              {/* 显示搜索结果 */}
              {pageOptions.length > 0 && (
                <Form.Item label="搜索结果">
                  <Select
                    placeholder="选择一个页面"
                    options={pageOptions}
                    onChange={(value) => {
                      const selected = pageOptions.find(
                        (opt) => opt.value === value,
                      );
                      if (selected) {
                        form.setFieldsValue({
                          pageId: value,
                          pageTitle: selected.label,
                        });
                        setPageInfo({ id: value, title: selected.label });
                      }
                    }}
                  />
                </Form.Item>
              )}

              <Form.Item
                label="文档标题"
                name="pageTitle"
                rules={[{ required: true, message: "请输入文档标题" }]}
              >
                <Input placeholder="自动填充或手动输入文档标题" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                label="父页面"
                name="parentPageId"
                rules={[
                  {
                    required: true,
                    message: "请输入父页面链接、ID 或搜索页面",
                  },
                ]}
                tooltip="在这个页面下创建新的子页面"
              >
                <Input.Search
                  placeholder="粘贴父页面链接、页面 ID 或搜索页面标题"
                  onChange={(e) => handleParentPageInput(e.target.value)}
                  loading={pageInfoLoading || parentSearchLoading}
                  allowClear
                  onSearch={(value) => {
                    if (value) {
                      handleParentPageInput(value);
                    }
                  }}
                />
              </Form.Item>

              {/* 显示父页面信息 */}
              {parentPageInfo && (
                <Alert
                  message="已识别父页面"
                  description={
                    <div>
                      <Text strong>{parentPageInfo.title}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        ID: {parentPageInfo.id}
                      </Text>
                    </div>
                  }
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}

              {/* 显示父页面搜索结果 */}
              {parentPageOptions.length > 0 && (
                <Form.Item label="搜索结果">
                  <Select
                    placeholder="选择父页面"
                    options={parentPageOptions}
                    onChange={(value) => {
                      const selected = parentPageOptions.find(
                        (opt) => opt.value === value,
                      );
                      if (selected) {
                        form.setFieldsValue({ parentPageId: value });
                        setParentPageInfo({ id: value, title: selected.label });
                        setParentPageOptions([]);
                      }
                    }}
                  />
                </Form.Item>
              )}

              <Form.Item
                label="新页面标题"
                name="pageTitle"
                rules={[{ required: true, message: "请输入新页面标题" }]}
              >
                <Input placeholder="输入新页面的标题" />
              </Form.Item>
            </>
          )}
        </Form>

        <div className={styles.helpText}>
          <Text type="secondary">
            {createMode === "existing" ? (
              <>
                <strong>关联现有页面的三种方式：</strong>
                <br />
                <strong>1. 粘贴链接：</strong>在 Notion 中打开页面 → 复制链接 →
                粘贴到输入框
                <br />
                <strong>2. 输入 ID：</strong>直接输入页面
                ID（如：3b628e1d-84da-4c6c-900d-b6e4a28532e1）
                <br />
                <strong>3. 搜索标题：</strong>输入关键词搜索页面（至少2个字符）
                <br />
                <br />
                <Text type="warning">
                  💡 系统会自动识别输入类型并显示页面信息或搜索结果
                </Text>
              </>
            ) : (
              <>
                <strong>创建新页面的三种方式：</strong>
                <br />
                <strong>1. 粘贴链接：</strong>在 Notion 中打开父页面 → 复制链接
                → 粘贴到输入框
                <br />
                <strong>2. 输入 ID：</strong>直接输入父页面 ID
                <br />
                <strong>3. 搜索标题：</strong>
                输入关键词搜索父页面（至少2个字符）
                <br />
                <br />
                <Text type="warning">
                  💡 新页面将在父页面下创建，并自动与本地文档关联
                </Text>
              </>
            )}
          </Text>
        </div>
      </Space>
    </Modal>
  );
});

export default NotionSyncModal;
