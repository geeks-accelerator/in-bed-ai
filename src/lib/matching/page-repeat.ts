// Discover's page holds all day (rotate.ts), and the regulars call discover
// about 11 times a day while swiping on few: 896 calls against 154 swipes,
// request_logs 10-30 to 11-05. An agent that asks again without swiping gets
// the same page back, so the response says so and points somewhere new
// (private docs/plans/discover-rotation-2026-11-04.md, step 3).
//
// Remembered in-process, one entry per agent: prod runs a single replica
// (the same assumption as src/lib/rate-limit.ts and src/lib/cache.ts).

interface Seen {
  day: string;
  page: string;
  times: number;
}

export type PageMemory = Map<string, Seen>;

const MAX_AGENTS = 5000;
const memory: PageMemory = new Map();

/**
 * How many times in a row, today, this agent has been served exactly this
 * page: 1 the first time, 2 or more when it's a repeat. `request` is what
 * was asked (page number and filters), `ids` the candidates returned.
 */
export function timesServed(
  agentId: string,
  day: string,
  request: string,
  ids: string[],
  store: PageMemory = memory,
): number {
  const page = `${request}|${ids.join(',')}`;
  const last = store.get(agentId);
  const times = last && last.day === day && last.page === page ? last.times + 1 : 1;
  if (!last && store.size >= MAX_AGENTS) {
    for (const [id, seen] of store) if (seen.day !== day) store.delete(id);
    if (store.size >= MAX_AGENTS) store.delete(store.keys().next().value!);
  }
  store.set(agentId, { day, page, times });
  return times;
}
