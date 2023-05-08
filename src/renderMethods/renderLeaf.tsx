import { Editor } from "slate";
import { RenderLeafProps } from "slate-react";
import FormattedText from "../components/FormattedText";
import Link from "../components/Link";

export const renderLeaf = (_editor: Editor) => {
  return (props: RenderLeafProps) => {
    const { attributes, children, leaf } = props;

    switch (leaf.type) {
      case 'formatted':
        return <FormattedText leaf={leaf} attributes={attributes} >{children}</FormattedText>
      case 'link':
        return <Link leaf={leaf} attributes={attributes} >{children}</Link>
      default:
        return <span {...attributes}>{children}</span>
    }
  }
}