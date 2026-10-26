import { isIP } from "node:net";

export function isPrivateNetworkAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith("::ffff:")) {
      const suffix = normalized.slice(7);
      if (suffix.includes(".")) return isPrivateNetworkAddress(suffix);
      const words = suffix.split(":").map((word) => parseInt(word, 16));
      return words.length !== 2 || isPrivateNetworkAddress(`${words[0] >> 8}.${words[0] & 255}.${words[1] >> 8}.${words[1] & 255}`);
    }
    if (normalized.startsWith("::") || normalized.startsWith("64:ff9b:") || normalized.startsWith("2001:")) return true;
  }
  return false;
}
