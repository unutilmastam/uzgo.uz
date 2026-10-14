/**
 * Money is integer tiyin (1 soʻm = 100 tiyin), carried as bigint or a decimal
 * string in JSON (docs/decisions/0005-money-in-tiyin.md). Never floats.
 */
export type Tiyin = bigint | string;

export type MoneyLocale = 'uz' | 'ru';

const CURRENCY: Record<MoneyLocale, string> = { uz: 'soʻm', ru: 'сум' };
const NBSP = ' ';

export function toTiyin(value: Tiyin): bigint {
  if (typeof value === 'bigint') return value;
  if (!/^-?\d+$/.test(value)) throw new Error('Invalid tiyin amount');
  return BigInt(value);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/**
 * Formats tiyin as soʻm: 1250000n → "12 500 soʻm" / "12 500 сум" (non-breaking
 * spaces). Whole soʻm amounts are shown without tiyin; otherwise two decimals
 * with a comma, as is usual in Uzbekistan.
 */
export function formatPrice(value: Tiyin, locale: MoneyLocale): string {
  const tiyin = toTiyin(value);
  const negative = tiyin < 0n;
  const abs = negative ? -tiyin : tiyin;
  const som = abs / 100n;
  const rest = abs % 100n;
  const amount =
    groupThousands(som.toString()) + (rest === 0n ? '' : `,${rest.toString().padStart(2, '0')}`);
  return `${negative ? '−' : ''}${amount}${NBSP}${CURRENCY[locale]}`;
}

/** Whole-percent discount from old → new price, rounded down. 0 if not a discount. */
export function discountPercent(oldPrice: Tiyin, price: Tiyin): number {
  const before = toTiyin(oldPrice);
  const after = toTiyin(price);
  if (before <= 0n || after >= before) return 0;
  return Number(((before - after) * 100n) / before);
}
