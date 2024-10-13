import Tags from "@/components/Tags";
import { Input, InputRef } from "antd";
import { forwardRef } from "react";

interface SearchTagProps {
  searchValue: string;
  tags: string[];
  onDeleteTag: (tag: string) => void;
  onSearchValueChange: (value: string) => void;
  onSearch: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  allowClear?: boolean;
  style?: React.CSSProperties;
}

const SearchTag = forwardRef<InputRef, SearchTagProps>((props, ref) => {
  const {
    searchValue,
    tags,
    onDeleteTag,
    onSearchValueChange,
    onSearch,
    allowClear = false,
    onFocus,
    onBlur,
    style
  } = props;

  return (
    <Input
      ref={ref}
      value={searchValue}
      prefix={tags.length > 0 ? <Tags closable tags={tags} onClose={onDeleteTag} /> : undefined}
      onChange={(e) => { onSearchValueChange(e.target.value) }}
      onPressEnter={onSearch}
      placeholder={'请输入标签进行筛选'}
      allowClear={allowClear}
      onFocus={onFocus}
      onBlur={onBlur}
      style={style}
    />
  )
})

export default SearchTag;