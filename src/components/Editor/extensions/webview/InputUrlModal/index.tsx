import React, { useState } from "react";
import { Button, Flex, Input } from "antd";
import { useMemoizedFn } from "ahooks";

interface InputUrlModalProps {
  onOk: (url: string) => void;
  onCancel: () => void;
  defaultValue?: string;
}

const InputUrlModal: React.FC<InputUrlModalProps> = ({
  onOk,
  onCancel,
  defaultValue = "",
}) => {
  const [url, setUrl] = useState(defaultValue);

  const handleInputChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(e.target.value);
    },
  );

  const handleOk = useMemoizedFn(() => {
    if (!url) {
      return;
    }
    onOk(url);
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleOk();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  });

  return (
    <Flex vertical gap={16}>
      <Input
        size="large"
        placeholder="请输入网页地址"
        value={url}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <Flex justify="flex-end" gap={8}>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" onClick={handleOk} disabled={!url}>
          确定
        </Button>
      </Flex>
    </Flex>
  );
};

export default InputUrlModal;
