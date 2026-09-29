import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import type { ListItemElement } from "../../../types";
import { Editor, Node, Transforms } from "slate";
import { useEffect, useRef, useState } from "react";
import { Popover, cn } from "@tau/ui";
import IconPicker from "../IconPicker";
import useUploadResource from "../../../../hooks/useUploadResource";

interface IListItemProps {
  attributes: RenderElementProps["attributes"];
  element: ListItemElement;
  children: React.ReactNode;
}

const ListItem = (props: IListItemProps) => {
  const { attributes, children, element } = props;
  const { isFold = false, allContent = element.children, icon, iconType, iconUrl } = element;
  const [isMultiline, setIsMultiline] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const listItemRef = useRef<HTMLLIElement>(null);

  const editor = useSlate();
  const readonly = useReadOnly();
  const uploadResource = useUploadResource();

  // Check if parent is bulleted-list
  const path = ReactEditor.findPath(editor, element);
  const parentPath = path.slice(0, -1);
  const parentNode = Node.get(editor, parentPath);
  const isBulletedList = parentNode && (parentNode as any).type === "bulleted-list";

  // 检测内容是否多行并测量第一行高度
  useEffect(() => {
    if (listItemRef.current) {
      const height = listItemRef.current.offsetHeight;

      // 找到下面的第一个 data-slate-node="element" children
      const firstLine = listItemRef.current.querySelector('[data-slate-node="element"]');
      const lineHeight = firstLine ? parseInt(getComputedStyle(firstLine).lineHeight) : 24;

      setIsMultiline(height > lineHeight * 2); // 如果高度超过2倍行高，认为是多行

      // 设置CSS变量，用于垂直线定位
      if (listItemRef.current) {
        listItemRef.current.style.setProperty("--first-line-height", `${lineHeight}px`);
      }
    }
  }, [children]);

  const handleFold = () => {
    // 设置 allContent 为 element.children
    // 设置 children 为 [element.children[0]]
    const path = ReactEditor.findPath(editor, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: path,
      });
      Transforms.insertNodes(
        editor,
        {
          type: "list-item",
          isFold: true,
          allContent: element.children,
          children: [element.children[0]],
        },
        {
          at: path,
        }
      );
    });
  };

  const handleUnfold = () => {
    // 设置 foldContent 为 children
    // 设置 children 为 [foldContent, ...allContent.slice(1)]
    const path = ReactEditor.findPath(editor, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: path,
      });
      Transforms.insertNodes(
        editor,
        {
          type: "list-item",
          allContent: element.allContent,
          isFold: false,
          // 折叠时可能对内容有修改，所以第一部分使用 children
          children: [...element.children, ...allContent.slice(1)],
        },
        {
          at: path,
        }
      );
    });
  };

  const handleOnClick = () => {
    if (isFold) {
      handleUnfold();
    } else {
      handleFold();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        icon: emoji,
        iconType: "emoji",
        iconUrl: undefined,
      } as Partial<ListItemElement>,
      { at: path }
    );
    setPickerOpen(false);
  };

  const handleImageSelect = (url: string) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        icon: undefined,
        iconType: "image",
        iconUrl: url,
      } as Partial<ListItemElement>,
      { at: path }
    );
    setPickerOpen(false);
  };

  const handleRemoveIcon = () => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        icon: undefined,
        iconType: undefined,
        iconUrl: undefined,
      } as Partial<ListItemElement>,
      { at: path }
    );
    setPickerOpen(false);
  };

  // 开合由 Popover 的触发器处理；这里只挡住冒泡，别让 Slate 把点击当成移动选区
  const handleBulletClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const foldAble = element.children.length > 1;
  const hasIcon = iconType === "emoji" || iconType === "image";

  return (
    <li
      data-fold={isFold ? "fold" : "unfold"}
      data-multiline={isMultiline ? "true" : "false"}
      data-has-icon={hasIcon ? "true" : "false"}
      className={cn(
        "ed-list-item relative border-l border-solid border-l-transparent pl-[0.5em]",
        // 内容超过一行时，从第一行底部起画左侧竖线
        isMultiline &&
          "after:absolute after:-left-[0.85em] after:bottom-[0.5em] after:top-[var(--first-line-height,1.5em)] after:w-[0.08em] after:bg-[var(--ed-border)] after:content-['']"
      )}
      {...attributes}
      ref={listItemRef}
    >
      {isBulletedList && (
        <Popover
          open={!readonly && pickerOpen}
          onOpenChange={setPickerOpen}
          arrow={false}
          placement="bottom-start"
          className="max-w-none overflow-hidden"
          trigger={
            <div
              contentEditable={false}
              className={cn(
                "absolute -left-[1.3em] top-[0.2em] z-[1] flex h-[1.4em] w-[1.4em] items-center justify-center rounded-[6px] transition-opacity duration-200 ease-in-out",
                !readonly && "cursor-pointer opacity-85 hover:opacity-100 active:opacity-70"
              )}
              onClick={handleBulletClick}
            >
              {hasIcon && (
                <div className="flex h-full w-full items-center justify-center">
                  {iconType === "emoji" && (
                    <span className="text-[1.1em] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                      {icon}
                    </span>
                  )}
                  {iconType === "image" && iconUrl && (
                    <img
                      src={iconUrl}
                      alt="icon"
                      className="h-[18px] w-[18px] rounded-[4px] object-cover"
                    />
                  )}
                </div>
              )}
            </div>
          }
        >
          <IconPicker
            onEmojiSelect={handleEmojiSelect}
            onImageSelect={handleImageSelect}
            onRemoveIcon={hasIcon ? handleRemoveIcon : undefined}
            uploadResource={uploadResource}
            hasIcon={hasIcon}
          />
        </Popover>
      )}
      <div className="absolute -left-[2em] top-[0.9em] h-full w-[0.625em]">
        {/* 折叠三角：可折叠时在列表项悬停时出现 */}
        <div
          contentEditable={false}
          className={cn(
            "hidden h-0 w-0 border-[0.3125em] border-solid border-transparent border-t-[var(--ed-text-secondary)]",
            isFold ? "-translate-y-[0.3125em] -rotate-90" : "-translate-y-[0.15625em]",
            (isFold || foldAble) && "cursor-pointer"
          )}
          data-list-fold-reveal={isFold || foldAble || undefined}
          onClick={handleOnClick}
        />
      </div>
      {children}
    </li>
  );
};

export default ListItem;
