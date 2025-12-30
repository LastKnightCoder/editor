import React, { useRef, useEffect, useState } from "react";
import { App } from "antd";
import { motion, AnimatePresence } from "framer-motion";
import { IAnswer } from "@/types";
import { Editor, IExtension, EditorRef } from "@tau/editor/src";
import CustomModal from "@/components/CustomModal";
import { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";
import useEditContent from "@/hooks/useEditContent";
import { isContentIsCard, buildCardFromContent } from "@/commands/card";
import { BsCardText } from "react-icons/bs";
import { defaultCardEventBus, getContentLength } from "@/utils";
import { formatDate } from "@/utils";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";

interface AnswerModalProps {
  visible: boolean;
  selectedAnswer: IAnswer | null;
  extensions: IExtension[];
  onClose: () => void;
  onAnswerChange?: (answer: IAnswer) => void;
  readOnly?: boolean;
  customTitle?: string;
  currentIndex?: number;
  total?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

const AnswerModal: React.FC<AnswerModalProps> = ({
  visible,
  selectedAnswer,
  extensions,
  onClose,
  onAnswerChange,
  readOnly = false,
  customTitle = "答案详情",
  currentIndex,
  total,
  onPrev,
  onNext,
}) => {
  const { message } = App.useApp();
  const editorRef = useRef<EditorRef>(null);
  const { throttleHandleEditorContentChange } = useEditContent(
    selectedAnswer?.id,
    (data) => {
      editorRef.current?.setEditorValue(data);
    },
  );

  const handleAnswerContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!selectedAnswer) {
      return;
    }
    throttleHandleEditorContentChange(content);
    const newAnswer = {
      ...selectedAnswer,
      content,
    };
    onAnswerChange?.(newAnswer);
  });

  useUnmount(() => {
    throttleHandleEditorContentChange.flush();
  });

  const [isCard, setIsCard] = useState(false);
  const [direction, setDirection] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (selectedAnswer?.id && visible) {
      isContentIsCard(selectedAnswer.id).then((res) => {
        setIsCard(res);
      });
    }
  }, [selectedAnswer?.id, visible]);

  const handleBuildCard = useMemoizedFn(() => {
    if (!selectedAnswer?.id) return;

    buildCardFromContent(selectedAnswer.id).then((card) => {
      if (card) {
        setIsCard(true);
        defaultCardEventBus
          .createEditor()
          .publishCardEvent("card:created", card);
        message.success("创建卡片成功");
        setDropdownOpen(false);
        // 通知父组件刷新答案类型
        onAnswerChange?.(selectedAnswer);
      } else {
        message.error("创建卡片失败");
      }
    });
  });

  const icon = (
    <svg
      className="w-5 h-5 text-blue-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
    </svg>
  );

  const showNavigation =
    typeof currentIndex === "number" &&
    currentIndex >= 0 &&
    typeof total === "number" &&
    total > 1;

  // 当没有选中的答案时，不渲染 Modal 内容
  if (!selectedAnswer) {
    return (
      <CustomModal
        open={visible}
        onCancel={onClose}
        width={800}
        title={customTitle}
        icon={icon}
        iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
        closeOnEscape={false}
        className="answer-modal"
        footer={null}
      >
        <div style={{ height: "70vh" }} />
      </CustomModal>
    );
  }

  const content = selectedAnswer.content;

  return (
    <CustomModal
      open={visible}
      onCancel={onClose}
      width={800}
      title={customTitle}
      icon={icon}
      iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
      closeOnEscape={false}
      footer={null}
      bodyScrollable={false}
      contentStyle={{ height: "80vh", maxHeight: "80vh" }}
    >
      <div className="flex flex-col h-full">
        {/* Metadata and actions */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-slate-800 shrink-0">
          <div className="flex text-xs gap-2.5 text-gray-500 dark:text-gray-400">
            {content && (
              <>
                <div>
                  <span>
                    创建于 {formatDate(selectedAnswer.createTime, true)}
                  </span>
                </div>
                <div>
                  <span>
                    最后修改于 {formatDate(selectedAnswer.updateTime, true)}
                  </span>
                </div>
                <div>字数：{getContentLength(content)}</div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-4">
            {!isCard && (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-1.5"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                  更多
                </button>
                {dropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-9998"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-1 w-40 z-9999 rounded-xl shadow-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 py-1">
                      <button
                        onClick={handleBuildCard}
                        className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                      >
                        <BsCardText className="w-4 h-4" />
                        创建卡片
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden">
          {showNavigation && (
            <>
              <button
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 px-3 py-2 flex items-center justify-center text-2xl text-gray-400 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white transition-colors"
                onClick={() => {
                  if (!onPrev) return;
                  setDirection(-1);
                  onPrev();
                }}
              >
                <LeftOutlined />
              </button>
              <button
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 px-3 py-2 flex items-center justify-center text-2xl text-gray-400 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white transition-colors"
                onClick={() => {
                  if (!onNext) return;
                  setDirection(1);
                  onNext();
                }}
              >
                <RightOutlined />
              </button>
            </>
          )}
          <div className="min-h-full">
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={selectedAnswer.id}
                custom={direction}
                initial={{ x: direction >= 0 ? 40 : -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction >= 0 ? -40 : 40, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Editor
                  key={`answer-${selectedAnswer.id}`}
                  className="p-5"
                  ref={editorRef}
                  readonly={readOnly}
                  initValue={selectedAnswer.content}
                  extensions={extensions}
                  onChange={handleAnswerContentChange}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </CustomModal>
  );
};

export default AnswerModal;
