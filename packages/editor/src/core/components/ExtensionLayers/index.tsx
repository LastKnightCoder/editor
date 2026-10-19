import { Component, createElement, type ComponentType, type ReactNode } from "react";
import type { ExtensionLayerProps } from "../../api/extension";

export interface RegisteredLayer {
  readonly owner: string;
  readonly component: ComponentType<ExtensionLayerProps>;
}

interface Props {
  layer: RegisteredLayer;
  readOnly: boolean;
  report: (owner: string, error: unknown) => void;
}

class LayerBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  private failedComponent: RegisteredLayer["component"] | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.failedComponent = this.props.layer.component;
    this.props.report(this.props.layer.owner, error);
  }

  componentDidUpdate() {
    if (this.state.failed && this.failedComponent !== this.props.layer.component) {
      this.failedComponent = null;
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    return this.state.failed
      ? null
      : createElement(this.props.layer.component, {
          readOnly: this.props.readOnly,
        });
  }
}

export default function ExtensionLayers({
  layers,
  report,
  readOnly,
}: {
  layers: readonly RegisteredLayer[];
  report: Props["report"];
  readOnly: boolean;
}) {
  return (
    <>
      {layers.map((layer, index) => (
        <LayerBoundary
          key={JSON.stringify([layer.owner, index])}
          layer={layer}
          report={report}
          readOnly={readOnly}
        />
      ))}
    </>
  );
}
