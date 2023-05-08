import { Editor } from "slate";
import { RenderLeafProps } from "slate-react";
import FormattedText from "../components/FormattedText";

export const renderLeaf = (_editor: Editor) => {
  return (props: RenderLeafProps) => {
    const { attributes, children, leaf } = props;

    switch (leaf.type) {
      case 'formatted':
        return <FormattedText leaf={leaf} attributes={attributes} >{children}</FormattedText>
      default:
        return <span {...attributes}>{children}</span>
    }
  }
}