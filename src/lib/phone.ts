/** Indian ten-digit mobiles are expanded to +91; other countries must include +. */
export function toE164Phone(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  return null;
}
