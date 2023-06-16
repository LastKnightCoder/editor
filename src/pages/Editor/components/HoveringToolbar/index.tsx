import { Editor, Range } from 'slate';
import { useSlate, useSlateSelection, useFocused } from "slate-react";
import { createPortal } from 'react-dom';
import {ReactNode, useEffect, useRef} from "react";
import {Button} from "antd";
import styles from './index.module.less';

const Portal = ({ children }: { children: ReactNode }) => {
  return createPortal(children, document.body)
}

const HoveringToolbar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const editor = useSlate();
  const focused = useFocused();
  const selection = useSlateSelection();

  useEffect(() => {
    const el = ref.current

    if (!el) {
      return
    }

    if (
      !selection ||
      !focused ||
      Range.isCollapsed(selection) ||
      Editor.string(editor, selection) === ''
    ) {
      el.removeAttribute('style')
      return
    }

    const domSelection = window.getSelection()
    if (domSelection && domSelection.rangeCount > 0) {
      const domRange = domSelection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();
      el.style.opacity = '1';
      el.style.top = `${rect.top + window.scrollX - el.offsetHeight - 4}px`;
      el.style.left = `${rect.left + window.scrollY - el.offsetWidth / 2 + rect.width / 2}px`;
    }
  }, [selection, focused, editor]);

  return (
    <Portal>
      <div
        className={styles.hoveringToolbar}
        ref={ref}
      >
        <Button>bold</Button>
      </div>
    </Portal>
  )
}

export default HoveringToolbar;