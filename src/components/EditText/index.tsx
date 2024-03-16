import { useEffect, useRef, useState } from 'react';

interface IEditTextProps {
  className?: string;
  style?: React.CSSProperties;
  defaultValue?: string;
  contentEditable?: boolean;
  onChange?: (value: string) => void;
  onPressEnter?: () => void;
}

const EditText = (props: IEditTextProps) => {
  const { className, style, defaultValue, contentEditable = false, onChange, onPressEnter } = props;

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 禁止在标题中输入回车
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isEditing) {
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
    >
      {defaultValue}
    </div>
  )
}

export default EditText;
