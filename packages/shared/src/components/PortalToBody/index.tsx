import { ReactNode } from "react";
import { createPortal } from "react-dom";

interface PortalToBodyProps {
  children: ReactNode;
}

const PortalToBody = ({ children }: PortalToBodyProps) => {
  return createPortal(children, document.body);
};

export default PortalToBody;
