import { Flex, InputNumber } from "antd";

interface NumberInputProps {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  onFocus: () => void;
  onBlur: () => void;
  min?: number;
  max?: number;
  step?: number;
}

const NumberInput = (props: NumberInputProps) => {
  const {
    label,
    value,
    onChange,
    onFocus,
    onBlur,
    min,
    max,
    step
  } = props;

  return (
    <Flex gap={10} align={'center'}>
      <div style={{ flex: 'none' }}>{label}: </div>
      <InputNumber
        value={value}
        onChange={v => {
          if (v === null) return;
          onChange(v);
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        min={min}
        max={max}
        step={step}
      />
    </Flex>
  )
}

export default NumberInput;
