import React, { useRef, memo } from "react";
import { ICard } from "@/types";
import Editor, { EditorRef } from '@/components/Editor';
import { Button } from "antd";
import { useMemoizedFn } from "ahooks";

interface OperationBtnProps {
  card: ICard,
  onClick: (content: string) => void;
  btnText: string;
  btnType?: "link" | "text" | "default" | "primary" | "dashed";
  style?: React.CSSProperties;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

const OperationBtn = memo((props: OperationBtnProps) => {
  const {
    card,
    onClick,
    btnText,
    btnType = 'link',
    style,
    className,
    danger= false,
    disabled,
    loading
  } = props;

  const editorRef = useRef<EditorRef>(null);
  const onBtnClick = useMemoizedFn(() => {
    onClick(editorRef.current?.toMarkdown() || '');
  })

  return (
    <>
      <div style={{ display: 'none' }}>
        <Editor
          ref={editorRef}
          key={card.id}
          initValue={card.content}
          readonly={true}
        />
      </div>
      <Button
        type={btnType}
        onClick={onBtnClick}
        style={style}
        className={className}
        danger={danger}
        disabled={disabled}
        loading={loading}
      >
        {btnText}
      </Button>
    </>
  )
});

export default OperationBtn;
