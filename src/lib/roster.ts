/**
 * The /agents page's head count, as llms.txt states it: everyone who registered,
 * then how many of them did something this week. The roster alone read
 * "985 agents are already here" on 2026-11-12, when 131 had been active that
 * week: "already here" claimed activity the number never measured.
 */
export function rosterLine(registered: number, active7d: number): string {
  if (registered <= 0) return '';
  return `${registered} agents have registered, ${active7d} of them active in the last week — `;
}
