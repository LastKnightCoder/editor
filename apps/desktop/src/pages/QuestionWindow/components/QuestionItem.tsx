import { useRef, useState, memo, useMemo } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Dropdown, App } from "antd";
import classNames from "classnames";
import {
  MdNote,
  MdArticle,
  MdFolder,
  MdDescription,
  MdClose,
} from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";
import EditText, { EditTextHandle } from "@/components/EditText";
import useTheme from "@/hooks/useTheme";
import useThemeColors from "@/hooks/useThemeColors";
import { IQuestion } from "@/types/question";
import { getEditorText } from "@/utils/editor";

type DragQuestion = { type: "QUESTION_ITEM"; id: number };

export interface QuestionItemHandlers {
  onUpdateTitle: (id: number, title: string) => void;
  onOpenNewAnswer: (id: number) => void;
  onOpenSelectAnswer: (id: number) => void;
  onMoveToGroup: (id: number, toGroupId: number) => void;
  onDelete: (id: number) => void;
  onReorder: (orderedIds: number[]) => void;
  onOpenAnswer: (questionId: number, answerId: number) => void;
  onDeleteAnswer: (questionId: number, answerId: number) => void;
  onUpdateStatus: (
    id: number,
    status: "not_started" | "in_progress" | "resolved",
  ) => void;
  onViewDetails: (id: number) => void;
}

interface QuestionItemProps extends QuestionItemHandlers {
  showBorder?: boolean;
  question: IQuestion;
  groups: { id: number; title: string }[];
  allQuestionIds: number[];
  answerTitles: Record<number, string>;
  answerTypes: Record<number, string>;
}

const getTypeIcon = (type?: string) => {
  const iconProps = "w-4 h-4";
  switch (type) {
    case "card":
      return <MdNote className={`${iconProps} text-blue-500`} />;
    case "article":
      return <MdArticle className={`${iconProps} text-green-500`} />;
    case "project-item":
      return <MdFolder className={`${iconProps} text-orange-500`} />;
    case "document-item":
    case "document":
      return <MdDescription className={`${iconProps} text-purple-500`} />;
    default:
      return <MdDescription className={`${iconProps} text-gray-500`} />;
  }
};

const QuestionItem = memo(
  ({
    showBorder = true,
    question: q,
    groups,
    allQuestionIds,
    answerTitles,
    answerTypes,
    onUpdateTitle,
    onOpenNewAnswer,
    onOpenSelectAnswer,
    onMoveToGroup,
    onDelete,
    onReorder,
    onOpenAnswer,
    onDeleteAnswer,
    onUpdateStatus,
    onViewDetails,
  }: QuestionItemProps) => {
    const { isDark } = useTheme();
    const themeColors = useThemeColors();
    const { modal } = App.useApp();
    const rowRef = useRef<HTMLDivElement>(null);
    const editTextRef = useRef<EditTextHandle>(null);
    const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [hoveredAnswerId, setHoveredAnswerId] = useState<number | null>(null);

    const [, drag] = useDrag(
      () => ({ type: "QUESTION_ITEM", item: { id: q.id } as DragQuestion }),
      [q.id],
    );

    const [, drop] = useDrop<DragQuestion, void, unknown>({
      accept: "QUESTION_ITEM",
      hover: (item, monitor) => {
        if (!rowRef.current || item.id === q.id) return;
        const rect = rowRef.current.getBoundingClientRect();
        const middleY = (rect.bottom - rect.top) / 2;
        const client = monitor.getClientOffset();
        if (!client) return;
        const hoverY = client.y - rect.top;
        const ids = [...allQuestionIds];
        const from = ids.indexOf(item.id);
        const to = ids.indexOf(q.id);
        if (from < 0 || to < 0) return;
        const moved = ids.splice(from, 1)[0];
        ids.splice(hoverY < middleY ? to : to + 1, 0, moved);
        onReorder(ids);
      },
    });

    drag(drop(rowRef));

    const handleTitleChange = (newTitle: string) => {
      if (newTitle.trim() && newTitle !== q.questionContent) {
        onUpdateTitle(q.id, newTitle.trim());
      }
    };

    const handleDeleteAnswer = (answerId: number) => {
      modal.confirm({
        title: "确定要删除这个答案吗？",
        okText: "删除",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => {
          onDeleteAnswer(q.id, answerId);
        },
      });
    };

    // 计算描述文本
    const descriptionText = useMemo(() => {
      if (!q.description || q.description.length === 0) {
        return "";
      }
      // 检查是否为空描述（只包含空段落）
      if (
        q.description.length === 1 &&
        q.description[0].type === "paragraph" &&
        q.description[0].children?.length === 1 &&
        "text" in q.description[0].children[0] &&
        q.description[0].children[0].text === ""
      ) {
        return "";
      }
      // 使用 getEditorText 获取纯文本，不限制长度
      return getEditorText(q.description, Number.MAX_SAFE_INTEGER).trim();
    }, [q.description]);

    const menuItems = [
      {
        key: "view-detail",
        label: "查看详情",
        onClick: () => onViewDetails(q.id),
      },
      {
        type: "divider" as const,
      },
      {
        key: "write-answer",
        label: "写答案",
        onClick: () => onOpenNewAnswer(q.id),
      },
      {
        key: "select-answer",
        label: "选择答案",
        onClick: () => onOpenSelectAnswer(q.id),
      },
      {
        key: "status",
        label: "设置状态",
        children: [
          {
            key: "status-not-started",
            label: "未开始",
            onClick: () => onUpdateStatus(q.id, "not_started"),
            disabled: q.status === "not_started",
          },
          {
            key: "status-in-progress",
            label: "进行中",
            onClick: () => onUpdateStatus(q.id, "in_progress"),
            disabled: q.status === "in_progress",
          },
          {
            key: "status-resolved",
            label: "已解决",
            onClick: () => onUpdateStatus(q.id, "resolved"),
            disabled: q.status === "resolved" || q.answers.length === 0,
          },
        ],
      },
      {
        type: "divider" as const,
      },
      {
        key: "move-to",
        label: "移动到",
        children: groups.map((g) => ({
          key: `move-${g.id}`,
          label: g.title,
          onClick: () => onMoveToGroup(q.id, g.id),
        })),
      },
      {
        type: "divider" as const,
      },
      {
        key: "delete",
        label: "删除问题",
        onClick: () => onDelete(q.id),
        danger: true,
      },
    ];

    return (
      <Dropdown
        menu={{
          items: menuItems,
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
          },
        }}
        trigger={["contextMenu"]}
      >
        <div
          ref={rowRef}
          className={classNames(
            "transition-all duration-200 cursor-pointer px-3 py-1 rounded-lg",
            themeColors.hoverClass,
          )}
          onClick={() => {
            if (clickTimerRef.current) {
              clearTimeout(clickTimerRef.current);
              clickTimerRef.current = null;
              setIsEditing(true);
              return;
            }

            clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null;
              if (q.answers.length === 0) {
                onOpenNewAnswer(q.id);
              } else {
                const firstAnswerId = q.answers[0];
                if (firstAnswerId != null) {
                  onOpenAnswer(q.id, firstAnswerId);
                }
              }
            }, 250);
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
          }}
        >
          <div
            className={classNames("flex gap-2 w-full", {
              [classNames("border-b pb-2", themeColors.borderClass)]:
                showBorder,
            })}
          >
            <div className="flex-1 min-w-0">
              <EditText
                ref={editTextRef}
                defaultValue={q.questionContent}
                contentEditable={isEditing}
                defaultFocus={isEditing}
                className={classNames(
                  "w-full truncate flex items-center h-7 rounded text-[14px]",
                  isDark ? "text-gray-200" : "text-gray-900",
                )}
                onChange={handleTitleChange}
                onBlur={() => setIsEditing(false)}
                onPressEnter={() => setIsEditing(false)}
              />

              {descriptionText && (
                <div
                  className={classNames(
                    "mt-1 text-xs line-clamp-2",
                    isDark ? "text-gray-400" : "text-gray-500",
                  )}
                >
                  {descriptionText}
                </div>
              )}

              {q.answers.length > 0 && (
                <div className="mt-2 overflow-x-auto overflow-y-hidden scrollbar-hide">
                  <div className="flex py-1 min-w-max gap-2">
                    {q.answers.map((aid) => {
                      const title = answerTitles[aid] || "未命名答案";
                      const type = answerTypes[aid] || "custom";
                      return (
                        <motion.div
                          key={aid}
                          className={classNames(
                            "relative group flex items-center gap-2 px-2 py-1 text-xs rounded-lg border transition-all cursor-pointer min-w-0 flex-none",
                            themeColors.cardBorderClass,
                            themeColors.cardBgClass,
                            "hover:border-opacity-80",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAnswer(q.id, aid);
                          }}
                          onMouseEnter={() => setHoveredAnswerId(aid)}
                          onMouseLeave={() => setHoveredAnswerId(null)}
                        >
                          <div className="shrink-0">{getTypeIcon(type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {title}
                            </div>
                          </div>
                          <AnimatePresence>
                            {hoveredAnswerId === aid && (
                              <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center cursor-pointer shadow-lg z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAnswer(aid);
                                }}
                              >
                                <MdClose className="w-3 h-3 text-white" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Dropdown>
    );
  },
);

QuestionItem.displayName = "QuestionItem";

export default QuestionItem;
