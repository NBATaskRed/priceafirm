import Link from "next/link";

export const TERMS_ACK_TEXT =
  "I confirm this is my own independent judgment, based only on the listing facts shown and sources I am authorized to use. I have not used or disclosed NDA-restricted information, and I am not submitting documents.";

/** First-valuation acknowledgement: one checkbox line above the button (spec 4.2). */
export function TermsCheckbox({ checked, onChange, id = "acceptTerms" }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <div className="flex gap-3 py-1 text-[13px] leading-snug text-text-soft">
      <input id={id} name="acceptTerms" type="checkbox" className="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <label htmlFor={id} className="cursor-pointer">
        {TERMS_ACK_TEXT} Points are not cash.{" "}
        <Link href="/terms" className="underline" target="_blank">
          Read the terms
        </Link>
      </label>
    </div>
  );
}
