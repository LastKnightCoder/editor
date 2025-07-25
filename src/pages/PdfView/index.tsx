import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const PdfView = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 重定向到列表页
    navigate("/pdfs/list");
  }, [navigate]);

  return null;
};

export default PdfView;
