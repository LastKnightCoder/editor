import React from "react";
import { Input, Space } from "antd";

interface IInputItemProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const InputItem = (props: IInputItemProps) => {
  const { label, value, onChange, className, style } = props;
  return (
    <Space className={className} style={style}>
      <div>{label}</div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Space>
  );
};

export default InputItem;
