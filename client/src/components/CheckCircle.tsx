interface CheckCircleProps {
  checked: boolean;
  label: string;
  onToggle: () => void;
  size?: 'row' | 'step';
  disabled?: boolean;
}

/** Round checkbox: 22px circle (18px for steps) inside a 44px hit area. */
export function CheckCircle({
  checked,
  label,
  onToggle,
  size = 'row',
  disabled,
}: CheckCircleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`check check--${size}${checked ? ' is-checked' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className="check__circle">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path className="check__tick" d="M7 12.5l3.2 3.2L17 9" pathLength={1} />
        </svg>
      </span>
    </button>
  );
}
