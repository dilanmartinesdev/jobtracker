/** Shapes returned by the API. Kept in one place so a backend change is a one-file fix. */

export const STATUSES = ["applied", "interview", "offer", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export interface Application {
  id: number;
  company: string;
  position: string;
  status: Status;
  location: string | null;
  url: string | null;
  notes: string | null;
  applied_date: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationInput {
  company: string;
  position: string;
  status: Status;
  location: string | null;
  url: string | null;
  notes: string | null;
  applied_date: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatusEvent {
  id: number;
  from_status: Status | null;
  to_status: Status;
  created_at: string;
}

export interface Stats {
  total: number;
  by_status: Record<Status, number>;
  reached_interview: number;
  reached_offer: number;
  interview_rate: number;
  offer_rate: number;
  weekly: { week_start: string; count: number }[];
}

export interface User {
  id: number;
  email: string;
  created_at: string;
}
