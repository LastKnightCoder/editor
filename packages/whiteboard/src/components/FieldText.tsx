import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { EditText, type EditTextHandle } from "@tau/ui";
import { bindTextFieldTextarea } from "@tau/editor/api";
import { useBoard } from "../hooks/useBoard";

type Props = ComponentProps<typeof EditText> & { elementId: string; field: string };
/** 协作输入直接消费公共字段增量，失焦不再整段覆盖。 */
export const FieldText = forwardRef<EditTextHandle, Props>(function FieldText(props, ref) {
  const board = useBoard();
  if (!board.document?.textField) return <EditText {...props} ref={ref} />;
  return <BoundFieldText {...props} ref={ref} />;
});
const BoundFieldText = forwardRef<EditTextHandle, Props>(function BoundFieldText(
  { elementId, field, ...props },
  ref
) {
  const board = useBoard(),
    input = useRef<HTMLInputElement>(null);
  const binding = useRef<ReturnType<typeof bindTextFieldTextarea>>(null);
  const [value, setValue] = useState(props.defaultValue ?? ""),
    [error, setError] = useState("");
  useLayoutEffect(() => {
    const handle = board.document!.textField!(elementId, field);
    const current = bindTextFieldTextarea(input.current!, handle, setValue, setError);
    binding.current = current;
    return () => {
      current.dispose();
      handle.dispose();
      binding.current = null;
    };
  }, [board, elementId, field]);
  useImperativeHandle(
    ref,
    () => ({
      clear: () => binding.current?.write(""),
      setValue: value => binding.current?.write(value),
      getValue: () => input.current?.value ?? "",
      focus: () => input.current?.focus(),
      blur: () => input.current?.blur(),
      isFocus: () => document.activeElement === input.current,
      focusEnd: () => {
        input.current?.focus();
        input.current?.setSelectionRange(value.length, value.length);
      },
      selectAll: () => input.current?.select(),
      setContentEditable: editable => {
        if (input.current) input.current.readOnly = !editable || board.readonly;
      },
    }),
    [board, value]
  );
  return (
    <>
      <input
        ref={input}
        id={props.id}
        className={props.className}
        style={props.style}
        size={Math.max(1, value.length)}
        aria-label={field}
        aria-invalid={!!error}
        readOnly={!props.contentEditable || board.readonly || !!error}
        onBlur={props.onBlur}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            props.onPressEnter?.();
          }
        }}
      />
      {error && (
        <span role="alert" className="text-tau-caption text-ink-2">
          {error}
        </span>
      )}
    </>
  );
});
