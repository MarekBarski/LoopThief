import { useState, type CSSProperties } from "react";

/**
 * Click-to-edit text field (sibling of `EditableNumber`). Used for names —
 * track / sequence / program / sample / project. Sanitizes input to a filename-safe
 * subset by default and enforces a max length (MPC convention = 16 chars).
 *
 * Workflow:
 *   - Single click → enter edit mode, current value pre-selected.
 *   - Enter → commit + blur. Empty value reverts (no commit) per spec.
 *   - Escape → cancel + blur (no state change).
 *   - Tab → native; blur fires → commit (same as Enter + focus next).
 *   - Click outside → blur → commit.
 *
 * Allowed characters default to `[A-Za-z0-9 \-_.]`. Disallowed chars are silently
 * dropped at input time.
 */
export function EditableText({
  value,
  onCommit,
  maxLength = 16,
  allowedChars = /[A-Za-z0-9 \-_.]/,
  uppercase = false,
  className,
  displayClassName,
  editClassName,
  style,
  ariaLabel,
}: {
  value: string;
  onCommit: (newValue: string) => void;
  maxLength?: number;
  allowedChars?: RegExp;
  uppercase?: boolean;
  className?: string;
  displayClassName?: string;
  editClassName?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== value) {
      onCommit(uppercase ? trimmed.toUpperCase() : trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  const sanitize = (raw: string): string => {
    // Filter to allowed characters one by one.
    let filtered = "";
    for (const ch of raw) {
      if (allowedChars.test(ch)) filtered += ch;
    }
    if (uppercase) filtered = filtered.toUpperCase();
    return filtered.slice(0, maxLength);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        maxLength={maxLength}
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
          // Tab: native; blur fires → commit.
        }}
        onFocus={(event) => event.currentTarget.select()}
        className={editClassName ?? className ?? "min-w-0 border border-amber-300/70 bg-black/50 px-[6px] py-[2px] text-[#eef6d8] outline-none"}
        style={style}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className={displayClassName ?? className ?? "truncate text-left text-[#eef6d8]"}
      style={style}
      aria-label={ariaLabel}
      title="Click to edit"
    >
      {value || "—"}
    </button>
  );
}
