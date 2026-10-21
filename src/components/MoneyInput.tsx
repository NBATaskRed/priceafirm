"use client";

import { useId } from "react";

/** Formats digits with thousands separators as the person types; the raw digit string is the value. */
export function formatDigits(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function MoneyInput({
  label,
  name,
  value,
  onChange,
  hint,
  required = false,
  disabled = false,
  placeholder = "2,900,000",
  error,
  autoFocus = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (digits: string) => void;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const id = useId();
  const digits = value.replace(/[^0-9]/g, "");
  const n = digits ? Number(digits) : null;
  const compact = n != null && n >= 1000 ? (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : `$${Math.round(n / 1000)}K`) : null;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
          $
        </span>
        <input
          id={id}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          className="input figures pl-7 text-lg"
          placeholder={placeholder}
          value={formatDigits(value)}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={`${id}-hint`}
        />
        {compact ? (
          <span aria-hidden="true" className="figures pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
            {compact}
          </span>
        ) : null}
      </div>
      <p id={`${id}-hint`} className={`mt-1 text-xs ${error ? "text-neg" : "text-muted"}`}>
        {error ?? hint ?? "Whole US dollars."}
      </p>
    </div>
  );
}
