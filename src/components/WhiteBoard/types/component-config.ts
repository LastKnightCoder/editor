import { BoardElement } from "@/components/WhiteBoard";

export interface IComponentConfig<T extends BoardElement> {
  element: T;
  onChange: (value: T) => void;
  onFocus: () => void;
  onBlur: () => void;
}