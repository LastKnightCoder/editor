import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, memo } from 'react';
import { useMemoizedFn, useMutationObserver } from "ahooks";

interface IEditTextProps {
  className?: string;
  style?: React.CSSProperties;
  defaultValue?: string;
  contentEditable?: boolean;
  onChange?: (value: string) => void;
  onPressEnter?: () => void;
  onDeleteEmpty?: () => void;
  defaultFocus?: boolean;
}

export type EditTextHandle = {
  clear: () => void;
  setValue: (value: string) => void;
  focus: () => void;
  focusEnd: () => void;
  blur: () => void;
  getValue: () => string;
}

const EditText = memo(forwardRef<EditTextHandle, IEditTextProps>((props, editTextRef) => {
  const {
    className,
    style,
    defaultValue,
    contentEditable = false,
    onChange,
    onPressEnter,
    defaultFocus = false,
    onDeleteEmpty
  } = props;

  const [initValue] = useState(defaultValue);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const innerText = useRef(initValue);

  useImperativeHandle(editTextRef, () => ({
    clear: () => {
      const inputEle = ref.current;
      if (inputEle) {
        inputEle.innerText = '';
        inputEle.blur();
      }
    },
    setValue: (value: string) => {
      const inputEle = ref.current;
      if (inputEle) {
        inputEle.innerText = value;
      }
    },
    focus: () => {
      ref.current?.focus();
    },
    focusEnd,
    blur: () => {
      ref.current?.blur();
    },
    getValue: () => {
      return ref.current?.innerText || '';
    }
  }));
  
  const focusEnd = useMemoizedFn(() => {
    if (!ref.current) return;

    ref.current.focus();
    // 创建一个范围对象
    const range = document.createRange();
    range.selectNodeContents(ref.current); // 选中内容
    range.collapse(false); // 将范围折叠到末尾

    // 获取选择对象并清除之前的选择
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  });

  useEffect(() => {
    if (defaultFocus) {
      focusEnd();

      setIsEditing(true);
    }
  }, [defaultFocus, focusEnd]);

  useMutationObserver((mutations) => {
    if (mutations.some(mutation => mutation.type === 'characterData')) {
      const mutation = mutations[0];
      const target = mutation.target as Text;
      onChange?.(target.nodeValue || '');
      innerText.current = target.nodeValue || '';
    }
  }, ref, {
    characterData: true,
    subtree: true,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isEditing && !isComposing.current && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        ref.current?.blur();
        onPressEnter?.();
      } else if (e.key === 'Backspace' && isEditing && !isComposing.current && !innerText.current) {
        e.preventDefault();
        e.stopPropagation();
        onDeleteEmpty?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isEditing, onDeleteEmpty, onPressEnter]);

  const handleFocus = () => {
    setIsEditing(true);
  }

  const handleBlur = () => {
    setIsEditing(false);
    onChange?.(ref.current?.innerText || '');
  }

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      // @ts-ignore
      contentEditable={contentEditable ? 'plaintext-only' : false}
      suppressContentEditableWarning
      onFocus={handleFocus}
      onBlur={handleBlur}
      onCompositionStart={() => isComposing.current = true}
      onCompositionEnd={() => isComposing.current = false}
    >
      {initValue}
    </div>
  )
}));

export default EditText;
