import {
  memo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { App, Empty, Spin, Tooltip } from "antd";
import {
  LoadingOutlined,
  OrderedListOutlined,
  HighlightOutlined,
  ApartmentOutlined,
  FilePptOutlined,
  QuestionCircleOutlined,
  CreditCardOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { VLNote } from "@/types/vibe-learning";
import { getVLNotesByProjectId, deleteVLNote } from "@/commands/vibe-learning";
import { formatDate } from "@/utils";

export interface AppListViewRef {
  refreshNotes: () => Promise<void>;
}

interface AppItem {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  available: boolean;
  onClick?: () => void;
}

interface AppListViewProps {
  projectId: number;
  onOpenOutline: () => void;
  onCreateNote: () => void;
  onEditNote: (note: VLNote) => void;
}

const AppListView = memo(
  forwardRef<AppListViewRef, AppListViewProps>((props, ref) => {
    const { projectId, onOpenOutline, onCreateNote, onEditNote } = props;
    const { modal, message } = App.useApp();

    const [notes, setNotes] = useState<VLNote[]>([]);
    const [loading, setLoading] = useState(true);

    // 加载笔记列表
    const loadNotes = useMemoizedFn(async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        const data = await getVLNotesByProjectId(projectId);
        setNotes(data);
      } catch (error) {
        console.error("Failed to load notes:", error);
      } finally {
        setLoading(false);
      }
    });

    useEffect(() => {
      loadNotes();
    }, [projectId, loadNotes]);

    // 暴露刷新方法给父组件
    useImperativeHandle(ref, () => ({
      refreshNotes: loadNotes,
    }));

    // 删除笔记
    const handleDeleteNote = useMemoizedFn(
      (e: React.MouseEvent, note: VLNote) => {
        e.stopPropagation(); // 阻止事件冒泡，避免触发编辑

        modal.confirm({
          title: "删除笔记",
          content: `确定要删除"${note.title || "无标题笔记"}"吗？`,
          okText: "删除",
          cancelText: "取消",
          okButtonProps: { danger: true },
          onOk: async () => {
            try {
              await deleteVLNote(note.id);
              message.success("笔记已删除");
              loadNotes(); // 刷新列表
            } catch (error) {
              console.error("Failed to delete note:", error);
              message.error("删除失败");
            }
          },
        });
      },
    );

    // 应用列表配置
    const apps: AppItem[] = [
      {
        key: "outline",
        icon: <OrderedListOutlined className="text-lg" />,
        title: "学习大纲",
        description: "梳理学习路径",
        available: true,
        onClick: onOpenOutline,
      },
      {
        key: "highlights",
        icon: <HighlightOutlined className="text-lg" />,
        title: "重点提炼",
        description: "提取核心干货",
        available: false,
      },
      {
        key: "mindmap",
        icon: <ApartmentOutlined className="text-lg" />,
        title: "思维导图",
        description: "可视化知识结构",
        available: false,
      },
      {
        key: "ppt",
        icon: <FilePptOutlined className="text-lg" />,
        title: "PPT",
        description: "高效汇报和演示",
        available: false,
      },
      {
        key: "quiz",
        icon: <QuestionCircleOutlined className="text-lg" />,
        title: "测验",
        description: "自测掌握程度",
        available: false,
      },
      {
        key: "flashcard",
        icon: <CreditCardOutlined className="text-lg" />,
        title: "记忆卡片",
        description: "碎片时间记忆",
        available: false,
      },
    ];

    return (
      <div className="flex flex-col h-full">
        {/* 标题栏 */}
        <div className="px-4 py-3 border-b border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0">
          <h3 className="text-base font-medium text-[#333] dark:text-[#e0e0e0] m-0">
            应用
          </h3>
        </div>

        {/* 滚动区域 */}
        <div className="flex-1 overflow-auto">
          {/* 应用网格 */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {apps.map((app) => (
                <Tooltip
                  key={app.key}
                  title={!app.available ? "开发中" : undefined}
                >
                  <div
                    className={`
                    p-3 rounded-lg border transition-all cursor-pointer
                    ${
                      app.available
                        ? "bg-white dark:bg-[#252525] border-[#e8e8e8] dark:border-[#3a3a3a] hover:border-[#1890ff] hover:shadow-sm"
                        : "bg-[#f5f5f5] dark:bg-[#1f1f1f] border-[#e8e8e8] dark:border-[#2a2a2a] opacity-60 cursor-not-allowed"
                    }
                  `}
                    onClick={app.available ? app.onClick : undefined}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={
                          app.available
                            ? "text-[#1890ff]"
                            : "text-[#999] dark:text-[#666]"
                        }
                      >
                        {app.icon}
                      </span>
                      <span className="text-sm font-medium text-[#333] dark:text-[#e0e0e0]">
                        {app.title}
                      </span>
                      {!app.available && (
                        <EditOutlined className="text-xs text-[#999] ml-auto" />
                      )}
                    </div>
                    <p className="text-xs text-[#999] dark:text-[#666] m-0">
                      {app.description}
                    </p>
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="px-4">
            <div className="border-t border-[#e8e8e8] dark:border-[#2a2a2a]" />
          </div>

          {/* 创作内容区域 */}
          <div className="p-4">
            <h4 className="text-sm font-medium text-[#666] dark:text-[#999] mb-3">
              创作内容
            </h4>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spin indicator={<LoadingOutlined spin />} />
              </div>
            ) : notes.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无笔记"
                className="py-4"
              />
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="group p-3 bg-white dark:bg-[#252525] rounded-lg border border-[#e8e8e8] dark:border-[#3a3a3a] cursor-pointer hover:border-[#1890ff] hover:shadow-sm transition-all"
                    onClick={() => onEditNote(note)}
                  >
                    <div className="flex items-center gap-2">
                      <EditOutlined className="text-[#999]" />
                      <span className="flex-1 text-sm text-[#333] dark:text-[#e0e0e0] truncate">
                        {note.title || "无标题笔记"}
                      </span>
                      <div className="relative shrink-0 w-12 h-6 flex items-center justify-end">
                        <span className="text-xs text-[#999] group-hover:opacity-0 transition-opacity">
                          {formatDate(note.updateTime, true)}
                        </span>
                        <button
                          className="absolute right-0 top-0 flex items-center justify-center w-6 h-6 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-[#999] hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 border-none bg-transparent cursor-pointer"
                          onClick={(e) => handleDeleteNote(e, note)}
                          title="删除笔记"
                        >
                          <DeleteOutlined className="text-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部新建笔记按钮 */}
        <div className="p-4 border-t border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0">
          <button
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-[#252525] border border-[#e8e8e8] dark:border-[#3a3a3a] rounded-lg text-sm text-[#333] dark:text-[#e0e0e0] hover:border-[#1890ff] hover:text-[#1890ff] transition-all cursor-pointer"
            onClick={onCreateNote}
          >
            <PlusOutlined />
            <span>新建笔记</span>
          </button>
        </div>
      </div>
    );
  }),
);

AppListView.displayName = "AppListView";

export default AppListView;
