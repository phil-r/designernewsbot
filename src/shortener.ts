const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

export function encode(n: number): string {
  if (n === 0) {
    return ALPHABET[0];
  }
  let tempN = n;
  const base = ALPHABET.length;

  let result = '';
  while (tempN > 0) {
    result = ALPHABET[tempN % base] + result;
    tempN = Math.floor(tempN / base);
  }

  return result;
}

export function decode(s: string): number {
  let result = 0;
  const base = ALPHABET.length;
  for (let i = 0; i < s.length; i++) {
    const p = ALPHABET.indexOf(s[i]);
    if (p < 0) {
      return NaN;
    }
    result += p * Math.pow(base, s.length - i - 1);
  }
  return result;
}
