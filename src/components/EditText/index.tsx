import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react";
import { useMemoizedFn, useMutationObserver } from "ahooks";

interface IEditTextProps {
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  defaultValue?: string;
  contentEditable?: boolean;
  onChange?: (value: string) => void;
  onPressEnter?: () => void;
  onDeleteEmpty?: () => void;
  defaultFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  isSlateEditor?: boolean;
}

export type EditTextHandle = {
  clear: () => void;
  setValue: (value: string) => void;
  focus: () => void;
  isFocus: () => boolean;
  focusEnd: () => void;
  selectAll: () => void;
  blur: () => void;
  getValue: () => string;
  setContentEditable: (editable: boolean) => void;
};

const EditText = memo(
  forwardRef<EditTextHandle, IEditTextProps>((props, editTextRef) => {
    const {
      id,
      className,
      style,
      defaultValue,
      contentEditable = false,
      onChange,
      onPressEnter,
      defaultFocus = false,
      onDeleteEmpty,
      onBlur,
      onKeyDown,
      isSlateEditor = false,
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
          inputEle.innerText = "";
          inputEle.blur();
        }
      },
      setValue: (value: string) => {
        const inputEle = ref.current;
        if (inputEle) {
          inputEle.innerText = value;
        }
      },
      selectAll: () => {
        const inputEle = ref.current;
        if (!inputEle) return;
        const range = document.createRange();
        range.selectNodeContents(inputEle);

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      },
      focus: () => {
        ref.current?.focus();
      },
      isFocus: () => {
        return isEditing;
      },
      focusEnd,
      blur: () => {
        ref.current?.blur();
      },
      getValue: () => {
        return ref.current?.innerText || "";
      },
      setContentEditable: (editable: boolean) => {
        if (ref.current) {
          if (editable) {
            ref.current.setAttribute("contenteditable", "plaintext-only");
          } else {
            ref.current.removeAttribute("contenteditable");
          }
        }
      },
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
      if (isSlateEditor) {
        ref.current?.setAttribute("data-slate-editor", "true");
      } else {
        ref.current?.removeAttribute("data-slate-editor");
      }
    }, [isSlateEditor]);

    useEffect(() => {
      if (defaultFocus) {
        focusEnd();

        setIsEditing(true);
      }
    }, [defaultFocus, focusEnd]);

    useMutationObserver(
      () => {
        const textContent = ref.current?.innerText || "";
        onChange?.(textContent);
        innerText.current = textContent;
      },
      ref,
      {
        characterData: true,
        childList: true,
        subtree: true,
      },
    );

    const defaultKeyDownHandler = useMemoizedFn((e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        isEditing &&
        !isComposing.current &&
        !e.shiftKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        ref.current?.blur();
        onPressEnter?.();
      } else if (
        e.key === "Backspace" &&
        isEditing &&
        !isComposing.current &&
        !innerText.current
      ) {
        e.preventDefault();
        e.stopPropagation();
        onDeleteEmpty?.();
      }
    });

    useEffect(() => {
      document.addEventListener(
        "keydown",
        onKeyDown ? onKeyDown : defaultKeyDownHandler,
      );

      return () => {
        document.removeEventListener(
          "keydown",
          onKeyDown ? onKeyDown : defaultKeyDownHandler,
        );
      };
    }, [onKeyDown, defaultKeyDownHandler]);

    const handleFocus = () => {
      setIsEditing(true);
    };

    const handleBlur = useMemoizedFn(() => {
      if (!ref.current) return;
      setIsEditing(false);
      onChange?.(ref.current.innerText || "");
      onBlur?.();
    });

    return (
      <div
        id={id}
        ref={ref}
        className={className}
        style={style}
        // @ts-ignore
        contentEditable={contentEditable ? "plaintext-only" : false}
        suppressContentEditableWarning
        onFocus={handleFocus}
        onBlur={handleBlur}
        onCompositionStart={() => (isComposing.current = true)}
        onCompositionEnd={() => (isComposing.current = false)}
      >
        {initValue}
      </div>
    );
  }),
);

export default EditText;
