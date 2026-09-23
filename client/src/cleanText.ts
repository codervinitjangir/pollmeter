/**
 * Cleans up raw question / option text:
 * - Strips raw markdown backticks: `process.nextTick` -> process.nextTick
 * - Strips raw markdown asterisks: **text** -> text
 * - Fixes formatting spaces around dots in identifiers: Node .js -> Node.js, process ._ -> process._
 * - Cleans up multiple consecutive spaces and trims
 */
export function cleanText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/`([^`]+)`/g, '$1')
    .replace(/`/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\b([A-Za-z0-9_]+)\s+\.\s*([A-Za-z0-9_]+)\b/g, '$1.$2')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
