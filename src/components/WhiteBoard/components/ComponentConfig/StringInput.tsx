import { Flex, Input } from "antd";

interface StringInputProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const StringInput = (props: StringInputProps) => {
  const { label, value, onFocus, onChange, onBlur } = props;

  return (
    <Flex gap={10} align={'center'}>
      <div style={{ flex: 'none' }}>
        {label}:
      </div>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Flex>
  )
}

export default StringInput;
