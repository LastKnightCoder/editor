import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

interface IEditTextProps {
  className?: string;
  style?: React.CSSProperties;
  defaultValue?: string;
  contentEditable?: boolean;
  onChange?: (value: string) => void;
  onPressEnter?: () => void;
  defaultFocus?: boolean;
}

export type EditTextHandle = {
  clear: () => void;
  setValue: (value: string) => void;
  focus: () => void;
  blur: () => void;
  getValue: () => string;
}

const EditText = forwardRef<EditTextHandle, IEditTextProps>((props, editTextRef) => {
  const { className, style, defaultValue, contentEditable = false, onChange, onPressEnter, defaultFocus = false } = props;

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

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
    blur: () => {
      ref.current?.blur();
    },
    getValue: () => {
      return ref.current?.innerText || '';
    }
  }))

  useEffect(() => {
    if (defaultFocus) {
      ref.current?.focus();
      setIsEditing(true);
    }
  }, [defaultFocus])

  useEffect(() => {
    // 禁止在标题中输入回车
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isEditing && !isComposing.current) {
        e.preventDefault();
        e.stopPropagation();
        ref.current?.blur();
        onPressEnter?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isEditing, onPressEnter]);

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
      {defaultValue}
    </div>
  )
});

export default EditText;
