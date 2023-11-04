import React, { ReactNode, useEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from 'react-dom';

import { Editor, Range } from 'slate';
import { useSlate, useSlateSelection, useReadOnly, ReactEditor } from "slate-react";
import { useLocalStorageState } from "ahooks";
import classnames from "classnames";
import { sortBy } from 'lodash'

import { IConfigItem } from "@/components/Editor/types";

import styles from './index.module.less';

const Portal = ({ children }: { children: ReactNode }) => {
  return createPortal(children, document.body)
}

interface IHoveringToolbarProps {
  configs: IConfigItem[];
}

interface IHoveringBarContext {
  isHoveringBarShow: boolean;
}

export const HoveringBarContext = React.createContext<IHoveringBarContext>({
  isHoveringBarShow: false,
})

const HoveringToolbar = memo((props: IHoveringToolbarProps) => {
  const { configs } = props;

  const sortedConfigs: IConfigItem[] = useMemo(() => {
    return sortBy(configs, (config: IConfigItem) => config.order);
  }, [configs]);

  console.log('sortedConfigs', sortedConfigs);

  const ref = useRef<HTMLDivElement>(null);

  const [isHoveringBarShow, setIsHoveringBarShow] = useState<boolean>(false);

  const editor = useSlate();
  const selection = useSlateSelection();
  const readOnly = useReadOnly();

  const [localStoragePosition, setLocalStoragePosition] = useLocalStorageState<{ top: number, left: number }>('hoveringBarPosition', {
    defaultValue: {
      top: 0,
      left: 0,
    }
  });

  const [position, setPosition] = useState<{left: number, top: number}>(() => {
    if (localStoragePosition) {
      return localStoragePosition;
    }
    return {
      left: 0,
      top: 0,
    }
  });

  useEffect(() => {
    const el = ref.current;

    if (!el || readOnly) {
      return
    }

    const isCollapsed = selection && Range.isCollapsed(selection);
    const isEmpty = selection && Editor.string(editor, selection) === '';
    const close = !selection || isCollapsed || isEmpty;

    if (close) {
      setIsHoveringBarShow(false);
      return;
    }

    const domSelection = window.getSelection();
    if (domSelection && domSelection.rangeCount > 0) {
      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();
      const top = `${rect.top + window.scrollY - el.offsetHeight - 8}px`;
      const left = `${rect.left + window.scrollX - el.offsetWidth / 2 + rect.width / 2}px`;
      setPosition({
        top: parseInt(top),
        left: parseInt(left),
      });
      setLocalStoragePosition({
        top: parseInt(top),
        left: parseInt(left),
      })
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
    }
    document.addEventListener('click', fn);
    return () => {
      document.removeEventListener('click', fn);
    }
  }, [editor, readOnly, isHoveringBarShow]);

  return (
    <Portal>
      <HoveringBarContext.Provider value={{ isHoveringBarShow }}>
        <div
          ref={ref}
          className={classnames(styles.hoveringToolbar, { [styles.show]: isHoveringBarShow && !readOnly })}
          style={{
            left: position.left,
            top: position.top,
          }}
        >
          {
            sortedConfigs.map((config) => {
              const { element: Element, id } = config;
              return (
                <Element key={id} />
              )
            })
          }
        </div>
      </HoveringBarContext.Provider>
    </Portal>
  )
});

export default HoveringToolbar;