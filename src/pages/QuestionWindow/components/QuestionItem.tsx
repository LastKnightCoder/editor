import { useRef, useState, memo } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Dropdown, App } from "antd";
import classNames from "classnames";
import {
  MdMoreVert,
  MdNote,
  MdArticle,
  MdFolder,
  MdDescription,
  MdClose,
} from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";
import EditText, { EditTextHandle } from "@/components/EditText";
import useTheme from "@/hooks/useTheme";
import { IQuestion } from "@/types/question";

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
  }: QuestionItemProps) => {
    const { isDark } = useTheme();
    const { modal } = App.useApp();
    const rowRef = useRef<HTMLDivElement>(null);
    const editTextRef = useRef<EditTextHandle>(null);
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

    const menuItems = [
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
      <div
        ref={rowRef}
        className={classNames(
          "transition-all duration-200 cursor-pointer px-3 py-1 rounded-lg",
          {
            "hover:bg-[#1a1a1a]": isDark,
            "hover:bg-[#f6fbff]": !isDark,
          },
        )}
        onDoubleClick={() => setIsEditing(true)}
      >
        <div
          className={classNames("flex gap-2 w-full", {
            "border-b border-gray-200 dark:border-gray-600 pb-2": showBorder,
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
                          {
                            "border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50":
                              !isDark,
                            "border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-700":
                              isDark,
                          },
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAnswer(q.id, aid);
                        }}
                        onMouseEnter={() => setHoveredAnswerId(aid)}
                        onMouseLeave={() => setHoveredAnswerId(null)}
                      >
                        <div className="flex-shrink-0">{getTypeIcon(type)}</div>
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

          <div className="flex items-center gap-1">
            <Dropdown
              menu={{ items: menuItems }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <button
                className={classNames(
                  "p-1.5 rounded-full cursor-pointer flex items-center justify-center",
                  isDark
                    ? "text-gray-400 hover:text-gray-300 hover:bg-white/10"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-500/10",
                )}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <MdMoreVert size={16} />
              </button>
            </Dropdown>
          </div>
        </div>
      </div>
    );
  },
);

QuestionItem.displayName = "QuestionItem";

export default QuestionItem;
