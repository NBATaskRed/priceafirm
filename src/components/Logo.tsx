export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {/* A price tag turned into a plotted distribution: three bars rising to a peak. */}
        <rect x="2" y="13" width="4" height="9" rx="1" fill="var(--muted)" />
        <rect x="10" y="7" width="4" height="15" rx="1" fill="var(--accent)" />
        <rect x="18" y="2" width="4" height="20" rx="1" fill="var(--text)" />
      </svg>
      <span className="text-[15px] font-bold tracking-tight">PriceAFirm</span>
    </span>
  );
}
