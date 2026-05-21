import { useState, type CSSProperties } from "react";

/**
 * Click-to-edit numeric value. Replaces a static <span>/<button> showing a number
 * with a tiny input field activated by click. The PARENT supplies an `onCommit`
 * callback that accepts the parsed + clamped final number.
 *
 * Workflow (matches keyboard overhaul Phase C spec):
 *   - Single click → enter edit mode, current value pre-selected.
 *   - Enter → parse + clamp + commit + blur.
 *   - Escape → cancel + blur (no state change).
 *   - Tab → native behavior; blur fires → commit (same as Enter + native focus move).
 *   - Click outside → blur → commit.
 *
 * Typing is restricted at input time:
 *   - Always allow digits.
 *   - `.` (decimal) only if `allowDecimal` is true.
 *   - `-` (negative) only if `allowNegative` is true.
 *   - Any other character is silently dropped.
 *
 * Out-of-range values are clamped on commit (NOT rejected) per spec.
 *
 * Arrow buttons live OUTSIDE this component — caller composes < arrow EditableNumber arrow >
 * as needed. Mouse press-and-hold on arrows keeps working independently.
 */
export function EditableNumber({
  value,
  format,
  min,
  max,
  allowDecimal = false,
  allowNegative = false,
  onCommit,
  className,
  style,
  ariaLabel,
}: {
  value: number;
  format?: (n: number) => string;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  onCommit: (newValue: number) => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const displayValue = format ? format(value) : String(value);

  const startEditing = () => {
    setDraft(displayValue);
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      let clamped = parsed;
      if (typeof min === "number") clamped = Math.max(min, clamped);
      if (typeof max === "number") clamped = Math.min(max, clamped);
      if (clamped !== value) onCommit(clamped);
    }
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  const sanitize = (raw: string): string => {
    let v = raw;
    // Strip non-digit / non-decimal / non-minus first.
    v = v.replace(/[^0-9.\-]/g, "");
    if (!allowDecimal) v = v.replace(/\./g, "");
    if (!allowNegative) v = v.replace(/-/g, "");
    // Collapse multiple decimal points / misplaced minus.
    if (allowDecimal) {
      const firstDot = v.indexOf(".");
      if (firstDot !== -1) {
        v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
      }
    }
    if (allowNegative) {
      // Allow leading minus only.
      const hasLeading = v.startsWith("-");
      v = v.replace(/-/g, "");
      if (hasLeading) v = "-" + v;
    }
    return v;
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={draft}
        onChange={(event) => setDraft(sanitize(event.target.value))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
            event.currentTarget.blur();
          }
          // Tab: native — focus moves; blur fires → commit. Browser handles it.
        }}
        onFocus={(event) => event.currentTarget.select()}
        className={className ?? "min-w-0 border border-amber-300/70 bg-black/50 px-[6px] py-[2px] text-center text-[#eef6d8] outline-none"}
        style={style}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className={className ?? "truncate text-center text-[#eef6d8]"}
      style={style}
      aria-label={ariaLabel}
      title="Click to edit"
    >
      {displayValue}
    </button>
  );
}
