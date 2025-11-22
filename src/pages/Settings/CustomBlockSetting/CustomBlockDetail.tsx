import { useEffect, useState, useRef } from "react";
import { Spin, message, Modal, Form, Input, Popconfirm } from "antd";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import {
  MdArrowBack,
  MdEdit,
  MdCode,
  MdDescription,
  MdDelete,
} from "react-icons/md";
import useCustomBlockStore from "@/stores/useCustomBlockStore";
import {
  getCustomBlock,
  updateCustomBlockManifest,
  deleteCustomBlock,
} from "@/commands/custom-block";
import type { ICustomBlock } from "@/types/custom-block";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import { getEditorText } from "@/utils/editor";
import Editor, { EditorRef } from "@/components/Editor";
import CustomBlockSourceEditor from "./CustomBlockSourceEditor";
import CustomBlockReadmeEditor from "./CustomBlockReadmeEditor";
import styles from "./CustomBlockDetail.module.less";

interface CustomBlockDetailProps {
  blockId: string;
  onBack: () => void;
}

type ViewMode = "detail" | "source" | "readme";

const CustomBlockDetail = ({ blockId, onBack }: CustomBlockDetailProps) => {
  const [block, setBlock] = useState<ICustomBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [editManifestVisible, setEditManifestVisible] = useState(false);
  const [form] = Form.useForm<{ name: string; author: string }>();
  const descriptionEditorRef = useRef<EditorRef>(null);
  const [descriptionValue, setDescriptionValue] = useState<Descendant[]>([
    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
  ]);

  const { removeBlockFromCache } = useCustomBlockStore((state) => ({
    removeBlockFromCache: state.removeBlockFromCache,
  }));

  const loadBlock = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const data = await getCustomBlock(blockId);
      setBlock(data);
    } catch (error) {
      message.error("加载组件失败");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    loadBlock();
  }, [blockId, loadBlock]);

  const handleEditManifest = useMemoizedFn(() => {
    if (block) {
      form.setFieldsValue({
        name: block.manifest.name,
        author: block.manifest.author,
      });
      // 设置描述编辑器的内容
      const descContent: Descendant[] = block.manifest.description
        ? importFromMarkdown(block.manifest.description)
        : ([
            { type: "paragraph", children: [{ type: "formatted", text: "" }] },
          ] as Descendant[]);
      setDescriptionValue(descContent);

      // 延迟设置编辑器值，等待模态框打开
      setTimeout(() => {
        if (descriptionEditorRef.current) {
          descriptionEditorRef.current.setEditorValue(descContent);
        }
      }, 100);

      setEditManifestVisible(true);
    }
  });

  const handleManifestSubmit = useMemoizedFn(async () => {
    try {
      const values = await form.validateFields();

      // 获取描述的 Markdown 内容
      if (!descriptionEditorRef.current) {
        message.error("描述编辑器未初始化");
        return;
      }

      const editor = descriptionEditorRef.current.getEditor();
      const descriptionMarkdown = getMarkdown(editor.children as Descendant[]);

      // 更新 manifest
      await updateCustomBlockManifest(blockId, {
        ...values,
        description: descriptionMarkdown,
      });

      message.success("更新成功");
      setEditManifestVisible(false);
      await loadBlock();
    } catch (error) {
      message.error("更新失败");
    }
  });

  const handleDelete = useMemoizedFn(async () => {
    try {
      await deleteCustomBlock(blockId);
      message.success("删除成功");
      removeBlockFromCache(blockId);
      onBack();
    } catch (error) {
      message.error("删除失败");
    }
  });

  const handleEditSource = useMemoizedFn(() => {
    setViewMode("source");
  });

  const handleEditReadme = useMemoizedFn(() => {
    setViewMode("readme");
  });

  const handleBackToDetail = useMemoizedFn(async () => {
    setViewMode("detail");
    await loadBlock();
  });

  // 源码编辑视图
  if (viewMode === "source" && block) {
    return (
      <CustomBlockSourceEditor block={block} onBack={handleBackToDetail} />
    );
  }

  // README 编辑视图
  if (viewMode === "readme" && block) {
    return (
      <CustomBlockReadmeEditor block={block} onBack={handleBackToDetail} />
    );
  }

  // 详情视图
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.centerContent}>
          <Spin size="large" />
        </div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className={styles.container}>
        <div className={styles.centerContent}>
          <p className={styles.emptyText}>组件不存在</p>
          <button onClick={onBack} className={styles.buttonPrimary}>
            返回
          </button>
        </div>
      </div>
    );
  }

  const readmeContent: Descendant[] = block.readme
    ? importFromMarkdown(block.readme)
    : ([
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "暂无说明" }],
        },
      ] as Descendant[]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Part A: Header */}
        <button onClick={onBack} className={styles.backButton}>
          <MdArrowBack />
          <span>返回</span>
        </button>

        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{block.manifest.name}</h1>
            {block.isLocal && <span className={styles.tag}>本地创建</span>}
          </div>
          <p className={styles.description}>
            {block.manifest.description
              ? getEditorText(
                  importFromMarkdown(block.manifest.description),
                  100,
                )
              : "暂无描述"}
          </p>
        </div>

        {/* Part B: Action Bar */}
        {block.isLocal && (
          <div className={styles.actionBar}>
            <button onClick={handleEditSource} className={styles.buttonPrimary}>
              <MdCode />
              <span>编辑源码</span>
            </button>
            <button
              onClick={handleEditReadme}
              className={styles.buttonSecondary}
            >
              <MdDescription />
              <span>编辑 README</span>
            </button>
          </div>
        )}

        {/* Part C: Content Cards */}
        {/* Card 1: Basic Info */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>基本信息</h3>
            {block.isLocal && (
              <button
                onClick={handleEditManifest}
                className={styles.editButton}
              >
                <MdEdit />
                <span>编辑</span>
              </button>
            )}
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>组件 ID</div>
              <div className={styles.infoValue}>{block.id}</div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>作者</div>
              <div className={styles.infoValue}>{block.manifest.author}</div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.infoLabel}>启用状态</div>
              <div className={styles.infoValue}>
                {block.enabled ? "已启用" : "已禁用"}
              </div>
            </div>
            {block.createTime && (
              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>创建时间</div>
                <div className={styles.infoValue}>
                  {new Date(block.createTime).toLocaleString()}
                </div>
              </div>
            )}
            {block.updateTime && (
              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>更新时间</div>
                <div className={styles.infoValue}>
                  {new Date(block.updateTime).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Description Section */}
          <div className={styles.descriptionSection}>
            <div className={styles.descriptionTitle}>功能描述</div>
            <div className={styles.descriptionBlock}>
              <Editor
                initValue={
                  block.manifest.description
                    ? importFromMarkdown(block.manifest.description)
                    : ([
                        {
                          type: "paragraph",
                          children: [{ type: "formatted", text: "暂无描述" }],
                        },
                      ] as Descendant[])
                }
                readonly
              />
            </div>
          </div>
        </div>

        {/* Card 2: README */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>使用说明</h3>
          </div>
          <div className={styles.readmeContent}>
            <Editor initValue={readmeContent} readonly />
          </div>
        </div>

        {/* Footer: Delete Button */}
        {block.isLocal && (
          <div className={styles.footer}>
            <Popconfirm
              title="确认删除"
              description="删除后将无法恢复，确定要删除这个组件吗？"
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <button className={styles.buttonDanger}>
                <MdDelete />
                <span>删除组件</span>
              </button>
            </Popconfirm>
          </div>
        )}
      </div>

      {/* Edit Manifest Modal */}
      <Modal
        title="编辑组件信息"
        open={editManifestVisible}
        onOk={handleManifestSubmit}
        onCancel={() => setEditManifestVisible(false)}
        okText="保存"
        cancelText="取消"
        width={800}
        className={styles.modal}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="组件名称"
            name="name"
            rules={[{ required: true, message: "请输入组件名称" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="作者"
            name="author"
            rules={[{ required: true, message: "请输入作者名称" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="描述"
            rules={[
              {
                validator: async () => {
                  if (!descriptionEditorRef.current) return;
                  const editor = descriptionEditorRef.current.getEditor();
                  const text = editor.children
                    .map((n: any) =>
                      n.children?.map((c: any) => c.text).join(""),
                    )
                    .join("");
                  if (!text.trim()) {
                    throw new Error("请输入组件描述");
                  }
                },
              },
            ]}
          >
            <div className={styles.editorWrapper}>
              <Editor
                ref={descriptionEditorRef}
                initValue={descriptionValue}
                onChange={setDescriptionValue}
                readonly={false}
              />
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomBlockDetail;
