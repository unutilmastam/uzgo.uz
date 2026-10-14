/**
 * Original UZGO illustrations (flat, brand palette). Decorative only:
 * always rendered with aria-hidden. No third-party artwork.
 */
type ArtProps = { className?: string };

export function MarketArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="57" rx="20" ry="3" fill="#143c8f" opacity=".12" />
      <path d="M14 22h36l-3 31a4 4 0 0 1-4 3.6H21A4 4 0 0 1 17 53z" fill="#2c63d6" />
      <path d="M14 22h36l-.6 6H14.6z" fill="#143c8f" />
      <path
        d="M24 26v-6a8 8 0 0 1 16 0v6"
        fill="none"
        stroke="#3dd093"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="27" r="2.4" fill="#e8effd" />
      <circle cx="40" cy="27" r="2.4" fill="#e8effd" />
      <path
        d="M25 42l5 5 10-11"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DeliveryArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="36" cy="57" rx="20" ry="3" fill="#7a4a06" opacity=".12" />
      <path d="M20 24l16-8 16 8v20l-16 8-16-8z" fill="#f5b454" />
      <path d="M36 32v20l16-8V24z" fill="#e0912a" />
      <path d="M20 24l16 8 16-8-16-8z" fill="#ffd28a" />
      <path d="M28 20l16 8v6" fill="none" stroke="#b45309" strokeWidth="3" />
      <path d="M4 30h10M2 37h12M6 44h8" stroke="#2c63d6" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function GoArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="55" rx="24" ry="3" fill="#03653f" opacity=".14" />
      <path d="M12 38l5-12a6 6 0 0 1 5.5-4h19a6 6 0 0 1 5.5 4l5 12z" fill="#7fe3b8" />
      <path d="M20 36l3.5-9a3 3 0 0 1 2.8-2h11.4a3 3 0 0 1 2.8 2l3.5 9z" fill="#e8f9f1" />
      <rect x="8" y="36" width="48" height="12" rx="5" fill="#059862" />
      <circle cx="19" cy="49" r="5.5" fill="#151a25" />
      <circle cx="45" cy="49" r="5.5" fill="#151a25" />
      <circle cx="19" cy="49" r="2.2" fill="#dde1e8" />
      <circle cx="45" cy="49" r="2.2" fill="#dde1e8" />
      <rect x="11" y="40" width="6" height="3" rx="1.5" fill="#ffd28a" />
      <rect x="47" y="40" width="6" height="3" rx="1.5" fill="#ffd28a" />
      <rect x="27" y="16" width="10" height="5" rx="2" fill="#143c8f" />
    </svg>
  );
}

export function FoodArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="56" rx="22" ry="3" fill="#9a3412" opacity=".12" />
      {/* lagan with plov */}
      <ellipse cx="32" cy="42" rx="26" ry="9" fill="#2c63d6" />
      <ellipse cx="32" cy="40" rx="22" ry="6.5" fill="#e8effd" />
      <path d="M14 39c3-9 33-9 36 0-6 3-30 3-36 0z" fill="#f5b454" />
      <circle cx="24" cy="35" r="1.6" fill="#c2410c" />
      <circle cx="31" cy="33" r="1.6" fill="#c2410c" />
      <circle cx="38" cy="35" r="1.6" fill="#c2410c" />
      <circle cx="34" cy="37" r="1.4" fill="#fb8b5b" />
      <circle cx="27" cy="37.5" r="1.4" fill="#fb8b5b" />
      <path
        d="M24 22c-2-3 2-5 0-8M32 22c-2-3 2-5 0-8M40 22c-2-3 2-5 0-8"
        fill="none"
        stroke="#949dae"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Hero composition: phone storefront, shopping bag and parcels in motion. */
export function HeroArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 320 240"
      preserveAspectRatio="xMaxYMax meet"
      className={className}
      aria-hidden="true"
    >
      <circle cx="190" cy="120" r="104" fill="#ffffff" opacity=".08" />
      <circle cx="190" cy="120" r="70" fill="#ffffff" opacity=".08" />
      {/* motion lines */}
      <path
        d="M70 96h40M60 120h50M74 144h36"
        stroke="#3dd093"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {/* phone */}
      <rect x="128" y="34" width="104" height="184" rx="18" fill="#0a1f4d" />
      <rect x="135" y="42" width="90" height="168" rx="12" fill="#f4f7fe" />
      <rect x="164" y="47" width="32" height="6" rx="3" fill="#0a1f4d" />
      <rect x="143" y="62" width="74" height="12" rx="6" fill="#dde1e8" />
      <rect x="143" y="82" width="34" height="40" rx="6" fill="#d0defa" />
      <rect x="183" y="82" width="34" height="40" rx="6" fill="#dcf8eb" />
      <rect x="143" y="128" width="34" height="40" rx="6" fill="#ffe7cc" />
      <rect x="183" y="128" width="34" height="40" rx="6" fill="#d0defa" />
      <rect x="143" y="178" width="74" height="22" rx="8" fill="#047a4e" />
      <path d="M170 189h20" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      {/* bag */}
      <path d="M222 120h58l-5 76a7 7 0 0 1-7 6.5h-34a7 7 0 0 1-7-6.5z" fill="#3dd093" />
      <path
        d="M236 124v-10a15 15 0 0 1 30 0v10"
        fill="none"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M240 160l9 9 17-19"
        fill="none"
        stroke="#0a1f4d"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* parcels */}
      <path d="M86 168l26-13 26 13v30l-26 13-26-13z" fill="#f5b454" />
      <path d="M112 181v30l26-13v-30z" fill="#e0912a" />
      <path d="M86 168l26 13 26-13-26-13z" fill="#ffd28a" />
    </svg>
  );
}
