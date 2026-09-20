import React from "react";

interface IErrorBoundaryProps {
  children: React.ReactNode;
  key?: React.Key;
}

interface IErrorBoundaryState {
  error: string;
}

class ErrorBoundary extends React.Component<IErrorBoundaryProps, IErrorBoundaryState> {
  constructor(props: IErrorBoundaryProps) {
    super(props);
    this.state = { error: "" };
  }

  componentDidCatch(error: Error) {
    this.setState({ error: `${error.name}: ${error.message}` });
    console.error(`${error.name}: ${error.message}`);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="text-danger bg-danger-soft rounded-tau-sm text-tau-sm px-3 py-2">
          {error}
        </div>
      );
    } else {
      return <>{this.props.children}</>;
    }
  }
}

export default ErrorBoundary;
