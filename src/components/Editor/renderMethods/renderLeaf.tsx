import { RenderLeafProps } from "slate-react";
import FormattedText from "../components/FormattedText";

export const renderLeaf = () => {
  return (props: RenderLeafProps) => {
    const { attributes, children, leaf } = props;

    switch (leaf.type) {
      case 'formatted':
      default:
        return <FormattedText leaf={leaf} attributes={attributes} >{children}</FormattedText>
    }
  }
}