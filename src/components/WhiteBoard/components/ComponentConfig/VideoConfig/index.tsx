import { IComponentConfig, VideoElement } from "@/components/WhiteBoard";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { Flex } from "antd";
import StringInput from "../StringInput.tsx";

type ElementKey = keyof VideoElement;

const ImageConfig = (props: IComponentConfig<VideoElement>) => {
  const { element, onChange, onFocus, onBlur } = props;

  const onValueChange = useMemoizedFn((key: ElementKey, value: VideoElement[ElementKey]) => {
    const newElement = produce(element, draft => {
      draft[key] = value;
    });
    onChange(newElement);
  });

  return (
    <Flex vertical gap={12}>
      <StringInput
        label={'视频链接'}
        value={element.src}
        onChange={v => onValueChange('src', v)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Flex>
  )
}

export default ImageConfig;
