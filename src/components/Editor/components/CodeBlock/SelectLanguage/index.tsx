import { Select, ConfigProvider, theme } from "antd";

interface SelectLanguageProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

const languages = [
  { label: 'JavaScript', value: 'JavaScript' },
  { label: 'js', value: 'js' },
  { label: 'TypeScript', value: 'TypeScript' },
  { label: 'ts', value: 'ts' },
  { label: 'JSX', value: 'JSX' },
  { label: 'TSX', value: 'TSX' },
  { label: 'HTML', value: 'HTML' },
  { label: 'CSS', value: 'CSS' },
  { label: 'Vue', value: 'Vue' },
  { label: 'C', value: 'C' },
  { label: 'C++', value: 'C++' },
  { label: 'C#', value: 'C#' },
  { label: 'Java', value: 'Java' },
  { label: 'Rust', value: 'Rust' },
  { label: 'rs', value: 'rs' },
  { label: 'Go', value: 'Go' },
  { label: 'Python', value: 'Python' },
  { label: 'py', value: 'py' },
  { label: 'Objective C', value: 'Objective C' },
  { label: 'Scale', value: 'Scale' },
  { label: 'JSON', value: 'JSON' },
  { label: 'XML', value: 'HTML/XML' },
  { label: 'YAML', value: 'YAML' },
  { label: 'HTTP', value: 'HTTP' },
  { label: 'Diff', value: 'Diff' },
  { label: 'Bash', value: 'Bash' },
  { label: 'Shell', value: 'Shell' },
  { label: 'MySQL', value: 'MySQL' },
  { label: 'SQL', value: 'sql' },
  { label: 'Latex', value: 'stex' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'md', value: 'md' },
]

const SelectLanguage = (props: SelectLanguageProps) => {
  const { value, onChange, className, style = {} } = props;

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <Select
        showSearch
        value={value}
        onChange={onChange}
        placeholder="Select a language"
        optionFilterProp="children"
        options={languages}
        filterOption={(input, option) =>
          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
        }
        className={className}
        style={{ width: 120, ...style }}
      />
    </ConfigProvider>
  )
}

export default SelectLanguage;