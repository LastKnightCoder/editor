import { createRoot } from "react-dom/client";
import { NoteApp } from "../../note/NoteApp";
import "./style.css";

createRoot(document.getElementById("root")!).render(<NoteApp />);
