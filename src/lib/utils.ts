export async function randomHexString(byteLength: number): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);

    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Using dynamic import for Node.js crypto module
    const crypto = await import('crypto');
    const randomBuf = crypto.randomBytes(byteLength);

    return Array.from(randomBuf, (b: number) => b.toString(16).padStart(2, '0')).join('');
  }
}


export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
