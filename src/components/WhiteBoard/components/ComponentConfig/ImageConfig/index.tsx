import { IComponentConfig, ImageElement } from "@/components/WhiteBoard";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { Flex } from "antd";
import StringInput from "@/components/WhiteBoard/components/ComponentConfig/StringInput.tsx";
import SelectInput from "@/components/WhiteBoard/components/ComponentConfig/SelectInput.tsx";

type ElementKey = keyof ImageElement;

const ImageConfig = (props: IComponentConfig<ImageElement>) => {
  const { element, onChange, onFocus, onBlur } = props;

  const onValueChange = useMemoizedFn((key: ElementKey, value: ImageElement[ElementKey]) => {
    const newElement = produce(element, draft => {
      draft[key] = value;
    });
    onChange(newElement);
  });

  return (
    <Flex vertical gap={12}>
      <StringInput
        label={'图片链接'}
        value={element.src}
        onChange={v => onValueChange('src', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <SelectInput
        label={'缩放'}
        options={[
          'xMinYMid meet',
          'xMidYMid meet',
          'xMaxYMid meet',
          'xMinYMin meet',
          'xMidYMin meet',
          'xMaxYMin meet',
          'xMinYMax meet',
          'xMidYMax meet',
          'xMaxYMax meet',
          'xMinYMin slice',
          'xMinYMid slice',
          'xMinYMax slice',
          'xMidYMin slice',
          'xMidYMid slice',
          'xMidYMax slice',
          'xMaxYMin slice',
          'xMaxYMid slice',
          'xMaxYMax slice',
          'none'
        ]}
        value={element.preserveAspectRatio}
        onChange={v => onValueChange('preserveAspectRatio', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Flex>
  )
}

export default ImageConfig;