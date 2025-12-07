import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useReadOnly,
  useSlateStatic,
} from "slate-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMemoizedFn } from "ahooks";
import { Copy, Edit2, Link2Off, ExternalLink } from "lucide-react";
import classNames from "classnames";
import { App } from "antd";

import InlineChromiumBugfix from "../../../components/InlineChromiumBugFix";
import type { LinkElement } from "../../../types";
import LinkSelectModal from "./LinkSelectModal";

interface LinkProps {
  attributes: RenderElementProps["attributes"];
  element: LinkElement;
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

const LinkPopover = ({
  visible,
  linkRef,
  url,
  onEdit,
  onCopy,
  onUnlink,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onOpenUrl,
}: {
  visible: boolean;
  linkRef: React.RefObject<HTMLElement>;
  url: string;
  onEdit: () => void;
  onCopy: () => void;
  onUnlink: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenUrl: (url: string) => void;
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!visible || !linkRef.current) return;

    const updatePosition = () => {
      const linkRect = linkRef.current!.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect() || {
        width: 280,
        height: 40,
      };

      const gap = 8;
      let x = linkRect.left + linkRect.width / 2 - popoverRect.width / 2;
      let y = linkRect.bottom + gap;

      if (x < gap) x = gap;
      if (x + popoverRect.width > window.innerWidth - gap) {
        x = window.innerWidth - popoverRect.width - gap;
      }

      if (y + popoverRect.height > window.innerHeight - gap) {
        y = linkRect.top - popoverRect.height - gap;
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
  }, [visible, linkRef]);

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        linkRef.current &&
        !linkRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [visible, onClose, linkRef]);

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
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <div
            className={classNames(
              "flex items-center p-1.5 gap-2 max-w-[320px]",
              "bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl saturate-150",
              "border border-black/5 dark:border-white/10",
              "shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]",
              "rounded-lg",
            )}
          >
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
              title="打开链接"
              onClick={(e) => {
                e.preventDefault();
                if (url) onOpenUrl(url);
              }}
            >
              <ExternalLink size={15} strokeWidth={1.5} />
            </a>

            <div className="w-px h-3 bg-black/10 dark:bg-white/10" />

            <div
              className="flex-1 text-[13px] text-slate-600 dark:text-slate-300 truncate font-medium cursor-text select-text"
              title={url}
            >
              {url}
            </div>

            <div className="flex items-center gap-1 pl-1 border-l border-black/5 dark:border-white/5 ml-1">
              <IconButton icon={Copy} onClick={onCopy} tooltip="复制链接" />
              <IconButton icon={Edit2} onClick={onEdit} tooltip="编辑" />
              <IconButton
                icon={Link2Off}
                onClick={onUnlink}
                danger
                tooltip="取消链接"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

const Link: React.FC<React.PropsWithChildren<LinkProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, openEdit = false } = element;
  const readOnly = useReadOnly();
  const editor = useSlateStatic();
  const { message } = App.useApp();

  const openUrl = async (url) => {
    if (editor.services?.utility?.openUrl) {
      await editor.services.utility.openUrl(url);
    } else {
      window.open(url, "_blank");
    }
  }

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(openEdit);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (openEdit) {
      setIsModalOpen(true);
    }
  }, [openEdit]);

  const unwrapLink = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.unwrapNodes(editor, { at: path });
  });

  const handleLinkClick = useMemoizedFn((e: React.MouseEvent) => {
    if (readOnly) {
      openUrl(url);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      openUrl(url);
    }
  });

  const handleModalConfirm = useMemoizedFn(
    ({ url: newUrl }: { url: string }) => {
      if (!newUrl) {
        unwrapLink();
      } else {
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(
          editor,
          { openEdit: false, url: newUrl },
          { at: path },
        );
      }
      setIsModalOpen(false);
    },
  );

  const handleModalCancel = useMemoizedFn(() => {
    if (openEdit && !url) {
      unwrapLink();
    } else {
      if (openEdit) {
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(editor, { openEdit: false }, { at: path });
      }
    }
    setIsModalOpen(false);
  });

  const handleCopy = useMemoizedFn(() => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        message.success("链接已复制");
        setIsPopoverOpen(false);
      })
      .catch(() => {
        message.error("复制失败");
      });
  });

  const handleMouseEnter = () => {
    if (readOnly || isModalOpen) return;
    clearHoverTimer();
    setIsPopoverOpen(true);
  };

  const handleMouseLeave = () => {
    if (readOnly || isModalOpen) return;
    clearHoverTimer();
    timerRef.current = setTimeout(() => setIsPopoverOpen(false), 300);
  };

  return (
    <>
      <a
        {...attributes}
        ref={linkRef}
        href={url}
        className={classNames(
          "text-blue-500 border-b border-dashed border-blue-500/40 transition-colors cursor-pointer px-0.5 rounded-[2px]",
          "hover:bg-blue-500/10 hover:border-solid",
          "dark:text-blue-400 dark:border-blue-400/40 dark:hover:bg-blue-400/15",
        )}
        onClick={(e) => {
          e.preventDefault();
          handleLinkClick(e);
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </a>

      <LinkPopover
        visible={isPopoverOpen && !readOnly && !isModalOpen}
        linkRef={linkRef}
        url={url}
        onEdit={() => {
          setIsPopoverOpen(false);
          setIsModalOpen(true);
        }}
        onCopy={handleCopy}
        onUnlink={unwrapLink}
        onClose={() => setIsPopoverOpen(false)}
        onOpenUrl={openUrl}
        onMouseEnter={clearHoverTimer}
        onMouseLeave={() => {
          clearHoverTimer();
          timerRef.current = setTimeout(() => setIsPopoverOpen(false), 300);
        }}
      />

      <LinkSelectModal
        open={isModalOpen}
        initialUrl={url}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
      />
    </>
  );
};

export default Link;
