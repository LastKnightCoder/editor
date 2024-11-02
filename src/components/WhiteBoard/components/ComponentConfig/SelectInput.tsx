import { Flex, Select } from "antd";

interface SelectInputProps {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const SelectInput = (props: SelectInputProps) => {
  const { label, value, options, onChange, onFocus, onBlur } = props;

  return (
    <Flex gap={10} align={'center'}>
      <div style={{ flex: 'none' }}>{label}：</div>
      <Select
        value={value}
        options={options.map(option => ({ label: option, value: option }))}
        onSelect={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Flex>
  )
}

export default SelectInput;