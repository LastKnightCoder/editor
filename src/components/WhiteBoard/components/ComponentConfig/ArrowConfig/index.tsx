import { ArrowElement, EArrowLineType, IComponentConfig } from "@/components/WhiteBoard";
import { Flex } from "antd";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import SelectInput from "@/components/WhiteBoard/components/ComponentConfig/SelectInput.tsx";
import StringInput from "@/components/WhiteBoard/components/ComponentConfig/StringInput.tsx";
import NumberInput from "@/components/WhiteBoard/components/ComponentConfig/NumberInput.tsx";

type ElementKey = keyof ArrowElement;

const ArrowConfig = (props: IComponentConfig<ArrowElement>) => {
  const { element, onChange, onFocus, onBlur } = props;

  const onValueChange = useMemoizedFn((key: ElementKey, value: ArrowElement[ElementKey]) => {
    const newElement = produce(element, draft => {
      draft[key] = value;
    });
    onChange(newElement);
  });

  return (
    <Flex gap={12} vertical>
      <SelectInput
        label={'线类型'}
        value={element.lineType}
        options={[
          EArrowLineType.STRAIGHT,
          EArrowLineType.CURVE
        ]}
        onChange={v => onValueChange('lineType', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <StringInput
        label={'线颜色'}
        value={element.lineColor}
        onChange={v => onValueChange('lineColor', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <NumberInput
        label={'线宽'}
        value={element.lineWidth}
        onChange={v => onValueChange('lineWidth', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Flex>
  )
}

export default ArrowConfig;