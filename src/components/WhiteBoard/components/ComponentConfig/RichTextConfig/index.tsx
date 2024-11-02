import { useMemoizedFn } from "ahooks";
import { RichTextElement } from "@/components/WhiteBoard/plugins";
import { Flex } from "antd";
import { produce } from 'immer';
import NumberInput from "../NumberInput.tsx";
import StringInput from "../StringInput.tsx";

interface RichTextConfigProps {
  element: RichTextElement;
  onChange: (element: RichTextElement) => void;
  onFocus: () => void;
  onBlur: () => void;
}

type ElementKey = keyof RichTextElement;

const RichTextConfig = (props: RichTextConfigProps) => {
  const { element, onChange, onBlur, onFocus } = props;

  const onValueChange = useMemoizedFn((key: ElementKey, value: RichTextElement[ElementKey]) => {
    const newElement = produce(element, draft => {
      draft[key] = value;
    });
    onChange(newElement);
  })

  return (
    <Flex vertical gap={12}>
      <NumberInput
        label={'PaddingWidth'}
        value={element.paddingWidth}
        onChange={(v) => onValueChange('paddingWidth', v)}
        onFocus={onFocus}
        onBlur={onBlur}
        min={0}
      />
      <NumberInput
        label={'PaddingHeight'}
        value={element.paddingHeight}
        onChange={(v) => onValueChange('paddingHeight', v)}
        onFocus={onFocus}
        onBlur={onBlur}
        min={0}
      />
      <StringInput
        label={'背景颜色'}
        value={element.fill}
        onChange={v => onValueChange('fill', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <NumberInput
        label={'背景透明度'}
        value={element.fillOpacity}
        onChange={v => onValueChange('fillOpacity', v)}
        onFocus={onFocus}
        onBlur={onBlur}
        min={0}
        max={1}
        step={0.01}
      />
      <StringInput
        label={'边框颜色'}
        value={element.stroke}
        onChange={v => onValueChange('stroke', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <NumberInput
        label={'边框宽度'}
        value={element.strokeWidth}
        onChange={v => onValueChange('strokeWidth', v)}
        onFocus={onFocus}
        onBlur={onBlur}
        min={0}
      />
      <NumberInput
        label={'边框透明度'}
        value={element.strokeOpacity}
        onChange={v => {
          onValueChange('strokeOpacity', Math.min(Math.max(v, 0), 1));
        }}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Flex>
  )
}

export default RichTextConfig;
