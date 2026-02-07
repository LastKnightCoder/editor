import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Editor, Range } from "slate";
import {
  useSlate,
  useSlateSelection,
  useReadOnly,
  ReactEditor,
} from "slate-react";
import { useLocalStorageState } from "ahooks";
import classnames from "classnames";
import { sortBy } from "lodash";

import { IConfigItem } from "../../types";

import styles from "./index.module.less";

const Portal = ({ children }: { children: ReactNode }) => {
  return createPortal(children, document.body);
};

interface IHoveringToolbarProps {
  configs: IConfigItem[];
}

interface IHoveringBarContext {
  isHoveringBarShow: boolean;
}

export const HoveringBarContext = React.createContext<IHoveringBarContext>({
  isHoveringBarShow: false,
});

const HoveringToolbar = memo((props: IHoveringToolbarProps) => {
  const { configs } = props;

  const sortedConfigs: IConfigItem[] = useMemo(() => {
    return sortBy(configs, (config: IConfigItem) => config.order);
  }, [configs]);

  const ref = useRef<HTMLDivElement>(null);

  const [isHoveringBarShow, setIsHoveringBarShow] = useState<boolean>(false);

  const editor = useSlate();
  const selection = useSlateSelection();
  const readOnly = useReadOnly();

  const [localStoragePosition, setLocalStoragePosition] = useLocalStorageState<{
    top: number;
    left: number;
  }>("hoveringBarPosition", {
    defaultValue: {
      top: 0,
      left: 0,
    },
  });

  const [position, setPosition] = useState<{ left: number; top: number }>(
    () => {
      if (localStoragePosition) {
        return localStoragePosition;
      }
      return {
        left: 0,
        top: 0,
      };
    },
  );

  useEffect(() => {
    const el = ref.current;

    if (!el || readOnly) {
      return;
    }

    const isCollapsed = selection && Range.isCollapsed(selection);
    const isEmpty = selection && Editor.string(editor, selection) === "";
    const close = !selection || isCollapsed || isEmpty;

    if (close) {
      setIsHoveringBarShow(false);
      return;
    }

    const domSelection = window.getSelection();
    if (domSelection && domSelection.rangeCount > 0) {
      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();

      // 获取视口尺寸
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 8;

      // 计算初始位置
      let top = rect.top + window.scrollY - el.offsetHeight - padding;
      let left =
        rect.left + window.scrollX - el.offsetWidth / 2 + rect.width / 2;

      // 左边界碰撞检测
      if (left < padding) {
        left = padding;
      }

      // 右边界碰撞检测
      if (left + el.offsetWidth > viewportWidth - padding) {
        left = viewportWidth - el.offsetWidth - padding;
      }

      // 顶部碰撞检测：如果超出顶部，则显示在选中文本下方
      if (top < padding) {
        top = rect.bottom + window.scrollY + padding;
      }

      // 底部碰撞检测（当工具栏显示在下方时）
      if (top + el.offsetHeight > viewportHeight + window.scrollY - padding) {
        top = viewportHeight + window.scrollY - el.offsetHeight - padding;
      }

      setPosition({ top, left });
      setLocalStoragePosition({ top, left });
      setIsHoveringBarShow(true);
    }
  }, [editor, selection, readOnly, setLocalStoragePosition]);

  useEffect(() => {
    if (readOnly) return;
    const fn = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || !isHoveringBarShow || !editor.selection) {
        return;
      }
      const target = e.target as Node;
      const editorEl = ReactEditor.toDOMNode(editor, editor);
      if (editorEl.contains(target) || el.contains(target)) {
        return;
      }
      setIsHoveringBarShow(false);
    };
    document.addEventListener("click", fn);
    return () => {
      document.removeEventListener("click", fn);
    };
  }, [editor, readOnly, isHoveringBarShow]);

  return (
    <Portal>
      <HoveringBarContext.Provider value={{ isHoveringBarShow }}>
        <div
          ref={ref}
          className={classnames(styles.hoveringToolbar, {
            [styles.show]: isHoveringBarShow && !readOnly,
          })}
          style={{
            left: position.left,
            top: position.top,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
        >
          {sortedConfigs.map((config) => {
            const { element: Element, id } = config;
            return <Element key={id} />;
          })}
        </div>
      </HoveringBarContext.Provider>
    </Portal>
  );
});

export default HoveringToolbar;
