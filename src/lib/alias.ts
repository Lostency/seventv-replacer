/** 7TV only accepts aliases made of these characters. */
const VALID_ALIAS = /^[A-Za-z0-9_-]+$/;

const SPELLED_OUT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

export function isValidAlias(alias: string): boolean {
  return VALID_ALIAS.test(alias);
}

/**
 * The closest alias 7TV will accept: umlauts spelled out (ä → ae, ß → ss),
 * other accents dropped, anything else left out. Null when nothing usable is left.
 */
export function transliterate(alias: string): string | null {
  const spelled = alias.replace(/[äöüÄÖÜß]/g, (ch) => SPELLED_OUT[ch]!);
  const plain = spelled
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '');
  return plain && plain !== alias ? plain : null;
}
