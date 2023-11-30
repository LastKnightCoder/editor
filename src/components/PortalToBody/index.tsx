import React from "react";
import { createPortal } from "react-dom";

const PortalToBody = ({ children }: { children: React.ReactNode }) => {
  return createPortal(children, document.body);
}

export default PortalToBody;
