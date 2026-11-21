import type { Application, Status } from "../api/types";

export interface Stage {
  status: Status;
  label: string;
  hint: string;
}

/** Board order, left to right. The labels are what the person sees; `status` is what the API stores. */
export const STAGES: readonly Stage[] = [
  { status: "applied", label: "Applied", hint: "Waiting to hear back" },
  { status: "interview", label: "Interview", hint: "In conversation" },
  { status: "offer", label: "Offer", hint: "Decision time" },
  { status: "rejected", label: "Closed", hint: "Not moving forward" },
];

export const STAGE_LABEL: Record<Status, string> = Object.fromEntries(
  STAGES.map((stage) => [stage.status, stage.label]),
) as Record<Status, string>;

export function groupByStatus(items: readonly Application[]): Record<Status, Application[]> {
  const groups: Record<Status, Application[]> = {
    applied: [],
    interview: [],
    offer: [],
    rejected: [],
  };
  for (const item of items) groups[item.status].push(item);
  return groups;
}

/** Case-insensitive match on company or position. An empty query matches everything. */
export function matchesQuery(item: Application, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return item.company.toLowerCase().includes(needle) || item.position.toLowerCase().includes(needle);
}
