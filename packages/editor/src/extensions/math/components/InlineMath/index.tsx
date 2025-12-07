import React, {
  PropsWithChildren,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { Transforms, Editor } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlateStatic,
  useReadOnly,
  useSelected,
  useFocused,
} from "slate-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMemoizedFn } from "ahooks";
import { Type, X } from "lucide-react";
import classNames from "classnames";
import { Katex } from '@tau/shared';

import { InlineMathElement, CustomText } from "../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";

import styles from "./index.module.less";

interface InlineMathProps {
  attributes: RenderElementProps["attributes"];
  element: InlineMathElement;
}

const IconButton = ({
  onClick,
  icon: Icon,
  active = false,
  danger = false,
  tooltip,
}: {
  onClick: (e: React.MouseEvent) => void;
  icon: any;
  active?: boolean;
  danger?: boolean;
  tooltip?: string;
}) => (
  <button
    onClick={onClick}
    title={tooltip}
    className={classNames(
      "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
      "text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200",
      "hover:bg-black/5 dark:hover:bg-white/10",
      {
        "text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-500/20 dark:text-blue-400":
          active && !danger,
        "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/20 dark:text-red-400":
          danger,
      },
    )}
  >
    <Icon size={15} strokeWidth={1.5} />
  </button>
);

const MathPopover = ({
  visible,
  elementRef,
  tex,
  onTexChange,
  onUnwrap,
  onClose,
}: {
  visible: boolean;
  elementRef: React.RefObject<HTMLElement>;
  tex: string;
  onTexChange: (val: string) => void;
  onUnwrap: () => void;
  onClose: (reason?: "escape" | "outside" | "button") => void;
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!visible || !elementRef.current) return;

    const updatePosition = () => {
      const rect = elementRef.current!.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect() || {
        width: 320,
        height: 44,
      };

      const gap = 8;
      let x = rect.left + rect.width / 2 - popoverRect.width / 2;
      let y = rect.bottom + gap;

      if (x < gap) x = gap;
      if (x + popoverRect.width > window.innerWidth - gap) {
        x = window.innerWidth - popoverRect.width - gap;
      }

      if (y + popoverRect.height > window.innerHeight - gap) {
        y = rect.top - popoverRect.height - gap;
      }

      setPosition({ x, y });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, elementRef]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose("escape");
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        elementRef.current &&
        !elementRef.current.contains(e.target as Node)
      ) {
        onClose("outside");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, onClose, elementRef]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={popoverRef}
          className="fixed z-9999 flex flex-col"
          style={{ left: position.x, top: position.y }}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 2 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            duration: 0.1,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={classNames(
              "flex items-center p-1.5 gap-3 min-w-75 max-w-[400px]",
              "bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl saturate-150",
              "border border-black/5 dark:border-white/10",
              "shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]",
              "rounded-lg",
            )}
          >
            <div className="flex-1 flex items-center gap-3 pl-1.5">
              <span className="text-xs font-mono text-slate-400 select-none font-bold">
                TeX
              </span>
              <input
                ref={inputRef}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 font-mono"
                value={tex}
                onChange={(e) => onTexChange(e.target.value)}
                placeholder="输入 LaTeX 公式..."
              />
            </div>

            <div className="flex items-center gap-1 pl-1 border-l border-black/5 dark:border-white/5 ml-1">
              <IconButton icon={Type} onClick={onUnwrap} tooltip="还原为文本" />
              <IconButton
                icon={X}
                onClick={() => onClose("button")}
                tooltip="关闭"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

const InlineMath: React.FC<PropsWithChildren<InlineMathProps>> = (props) => {
  const { attributes, element, children } = props;
  const { tex } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();

  const [isOpen, setIsOpen] = useState(false);
  const elementRef = useRef<HTMLElement>(null);

  const handleTexChange = useMemoizedFn((newTex: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { tex: newTex }, { at: path });
  });

  const focusInlineElement = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.select(editor, path);
    ReactEditor.focus(editor);
  });

  const moveCaretOut = useMemoizedFn((direction: "left" | "right") => {
    const path = ReactEditor.findPath(editor, element);
    const targetPoint =
      direction === "left"
        ? Editor.before(editor, path, { voids: true })
        : Editor.after(editor, path, { voids: true });
    if (targetPoint) {
      Transforms.select(editor, targetPoint);
      ReactEditor.focus(editor);
    }
  });

  const moveCaretToInlineEnd = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    const targetPoint =
      Editor.after(editor, path, { voids: true }) ||
      Editor.before(editor, path, { voids: true });

    if (targetPoint) {
      Transforms.select(editor, targetPoint);
      return;
    }
    Transforms.select(editor, path);
  });

  const focusEditorWithDelay = useMemoizedFn(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        ReactEditor.focus(editor);
      }, 0);
    });
  });

  const handleUnwrap = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.removeNodes(editor, { at: path });
    const textNode: CustomText = { text: tex, type: "formatted" };
    Transforms.insertNodes(editor, textNode, { at: path });
    setIsOpen(false);
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!readOnly) {
      focusInlineElement();
      setIsOpen(true);
    }
  };

  const handleClose = useMemoizedFn(
    (reason?: "escape" | "outside" | "button") => {
      setIsOpen(false);
      if (reason === "outside") return;
      requestAnimationFrame(() => {
        moveCaretToInlineEnd();
        focusEditorWithDelay();
      });
    },
  );

  useEffect(() => {
    if (readOnly || !selected || !focused) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (
        !isOpen &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        event.stopPropagation();
        moveCaretOut(event.key === "ArrowLeft" ? "left" : "right");
        return;
      }

      if (!isOpen && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(true);
        return;
      }

      if (isOpen && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleClose("escape");
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [readOnly, selected, focused, isOpen, moveCaretOut, handleClose]);

  const showActiveStyle = !readOnly && (isOpen || (selected && focused));
  const showIndicator = !readOnly && selected && focused && !isOpen;

  return (
    <>
      <span
        {...attributes}
        ref={elementRef}
        className={classNames(styles.inlineMath, {
          [styles.inlineMathActive]: showActiveStyle,
          [styles.inlineMathEditing]: isOpen,
        })}
        onClick={handleClick}
      >
        {showIndicator && (
          <span className={styles.inlineMathIndicator} aria-hidden="true">
            TeX
          </span>
        )}
        {tex ? (
          <Katex tex={tex} />
        ) : (
          <span className="text-slate-400 px-1">Empty Math</span>
        )}
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </span>

      <MathPopover
        visible={isOpen && !readOnly}
        elementRef={elementRef}
        tex={tex}
        onTexChange={handleTexChange}
        onUnwrap={handleUnwrap}
        onClose={handleClose}
      />
    </>
  );
};

export default InlineMath;
