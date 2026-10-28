/** The wordmark (spec 4.2 item 1). Type only, no mark. */
export function Logo({ className = "" }: { size?: number; className?: string }) {
  return <span className={`text-[17px] font-bold tracking-[-0.01em] text-text md:text-[18px] ${className}`}>PriceAFirm</span>;
}
