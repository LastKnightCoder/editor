import { Editor, Range } from 'slate';
import {useSlate, ReactEditor} from "slate-react";
import { createPortal } from 'react-dom';
import {ReactNode, useEffect, useRef} from "react";
import HoveringButton from "./HoveringButton";
import useHoveringBarConfig from "./useHoveringBarConfig";
import styles from './index.module.less';

const Portal = ({ children }: { children: ReactNode }) => {
  return createPortal(children, document.body)
}

const HoveringToolbar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const editor = useSlate();
  const configs = useHoveringBarConfig();

  useEffect(() => {
    const el = ref.current;
    const { selection } = editor;

    if (!el) {
      return
    }

    // const focused = ReactEditor.isFocused(editor);
    const isCollapsed = selection && Range.isCollapsed(selection);
    const isEmpty = selection && Editor.string(editor, selection) === '';

    console.log('selection', selection, 'isCollapsed', isCollapsed, 'isEmpty', isEmpty);

    const close = !selection || isCollapsed || isEmpty;

    if (close) {
      console.log('hide hovering toolbar');
      el.removeAttribute('style');
      return;
    }

    const domSelection = window.getSelection()
    if (domSelection && domSelection.rangeCount > 0) {
      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();
      el.style.top = `${rect.top + window.scrollY - el.offsetHeight - 8}px`;
      el.style.left = `${rect.left + window.scrollX - el.offsetWidth / 2 + rect.width / 2}px`;
      el.style.opacity = '1';
    }
  });

  useEffect(() => {
    const fn = (e: any) => {
      // 如果点击在 editor 之外，则隐藏 hovering toolbar
      if (!editor.selection) {
        return;
      }
      const target = e.target;
      const editorEl = ReactEditor.toDOMNode(editor, editor);
      if (editorEl.contains(target)) {
        return;
      }
      const el = ref.current;
      if (!el) {
        return;
      }
      console.log('hide hovering toolbar');
      el.removeAttribute('style');
    }
    document.addEventListener('click', fn);
    return () => {
      document.removeEventListener('click', fn);
    }
  }, [editor]);

  return (
    <Portal>
      <div
        ref={ref}
        className={styles.hoveringToolbar}
      >
        {
          configs.map((config, index) => {
            return (
              <HoveringButton
                key={index}
                text={config.text}
                onClick={config.onClick}
                active={config.active}
              />
            )
          })
        }
      </div>
    </Portal>
  )
}

export default HoveringToolbar;