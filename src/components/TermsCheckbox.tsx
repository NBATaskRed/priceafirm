import Link from "next/link";

export const TERMS_ACK_TEXT =
  "I confirm this is my own independent judgment, based only on the listing facts shown and sources I am authorized to use. I have not used or disclosed NDA-restricted information, and I am not submitting documents.";

export function TermsCheckbox({ checked, onChange, id = "acceptTerms" }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer gap-3 rounded-[var(--radius-card)] border border-accent/50 bg-accent-soft p-3 text-sm">
      <input id={id} name="acceptTerms" type="checkbox" className="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <span>
        <span className="font-medium">Before your first contribution</span>
        <span className="mt-1 block text-text/90">{TERMS_ACK_TEXT}</span>
        <span className="mt-1 block text-xs text-muted">
          Points are not cash and your balance can go negative. Across your first 5 scored forecasts, your cumulative posted loss is floored at &minus;3. Read
          the{" "}
          <Link href="/terms" className="underline" target="_blank">
            terms
          </Link>
          .
        </span>
      </span>
    </label>
  );
}
