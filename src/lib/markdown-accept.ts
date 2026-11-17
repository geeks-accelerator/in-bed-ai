/**
 * Whether an Accept header asks for markdown rather than a web page (readiness D8:
 * the proxy answers `/` with llms.txt as markdown then). Browsers send text/html,
 * so a request naming both gets the page.
 */
export function wantsMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const types = accept.toLowerCase().split(',').map((t) => t.split(';')[0].trim());
  return types.includes('text/markdown') && !types.includes('text/html');
}
