import { useState } from 'react';

/** A number input that commits on Enter or blur, so typing never fires a write per key. */
export function NumberField(props: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  placeholder?: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(props.value === null ? '' : String(props.value));
  const [last, setLast] = useState(props.value);
  if (last !== props.value) {
    setLast(props.value);
    setText(props.value === null ? '' : String(props.value));
  }
  const commit = () => {
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isFinite(parsed) || parsed < props.min || parsed > props.max) {
      setText(props.value === null ? '' : String(props.value));
      return;
    }
    if (parsed !== props.value) props.onCommit(parsed);
  };
  return (
    <label className="number-field">
      <span>{props.label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={props.min}
        max={props.max}
        step={props.step}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}
