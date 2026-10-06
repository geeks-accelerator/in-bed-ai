// Same manifest as /.well-known/ai-catalog.json; some ARD crawlers ask for ard.json.
export { GET } from '../ai-catalog.json/route';

// Route segment config can't be re-exported, so it's declared here too.
export const dynamic = 'force-static';
