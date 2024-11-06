import { IComponentConfig } from "@/components/WhiteBoard";
import { GeometryElement } from "@/components/WhiteBoard/plugins";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { Flex } from "antd";
import StringInput from "@/components/WhiteBoard/components/ComponentConfig/StringInput.tsx";
import NumberInput from "@/components/WhiteBoard/components/ComponentConfig/NumberInput.tsx";

type ElementKey = keyof GeometryElement;

const GeometryConfig = (props: IComponentConfig<GeometryElement>) => {
  const { element, onChange, onFocus, onBlur } = props;

  const onValueChange = useMemoizedFn((key: ElementKey, value: GeometryElement[ElementKey]) => {
    const newElement = produce(element, draft => {
      draft[key] = value;
    });
    onChange(newElement);
  });

  return (
    <Flex vertical gap={12}>
      <StringInput
        label={'填充'}
        value={element.fill}
        onChange={v => onValueChange('fill', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <NumberInput
        label={'填充透明度'}
        value={element.fillOpacity}
        onChange={v => onValueChange('fillOpacity', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <StringInput
        label={'边框'}
        value={element.stroke}
        onChange={v => onValueChange('stroke', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <NumberInput
        label={'边框透明度'}
        value={element.strokeOpacity}
        onChange={v => onValueChange('strokeOpacity', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <NumberInput
        label={'边框宽度'}
        value={element.strokeWidth}
        onChange={v => onValueChange('strokeWidth', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Flex>
  )
}

export default GeometryConfig;
