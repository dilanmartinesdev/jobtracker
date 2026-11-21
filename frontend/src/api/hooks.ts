/** React Query hooks: one per API operation, plus the cache rules that keep the UI in sync. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { request } from "./client";
import type { Application, ApplicationInput, Page, Stats, Status, StatusEvent } from "./types";

export const keys = {
  applications: ["applications"] as const,
  stats: ["stats"] as const,
  history: (id: number) => ["history", id] as const,
};

const PAGE_SIZE = 500; // the API's maximum

/** Loads every application, following the pages until `total` is reached. */
export async function fetchAllApplications(signal?: AbortSignal): Promise<Application[]> {
  const all: Application[] = [];
  for (;;) {
    const page = await request<Page<Application>>(
      `/applications?limit=${PAGE_SIZE}&offset=${all.length}`,
      { signal },
    );
    all.push(...page.items);
    // An empty page also ends the loop, so a bad `total` can never spin forever.
    if (page.items.length === 0 || all.length >= page.total) return all;
  }
}

export function useApplications() {
  // The board shows everything at once and filters in the browser, which is instant for the
  // few hundred rows a person realistically tracks. Pages are followed so nothing is dropped.
  return useQuery({
    queryKey: keys.applications,
    queryFn: ({ signal }) => fetchAllApplications(signal),
  });
}

export function useStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: ({ signal }) => request<Stats>("/applications/stats", { signal }),
  });
}

export function useHistory(id: number | null) {
  return useQuery({
    queryKey: keys.history(id ?? -1),
    queryFn: ({ signal }) => request<StatusEvent[]>(`/applications/${id}/history`, { signal }),
    enabled: id !== null,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationInput) =>
      request<Application>("/applications", { method: "POST", json: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.applications });
      void queryClient.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<ApplicationInput> }) =>
      request<Application>(`/applications/${id}`, { method: "PATCH", json: changes }),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: keys.applications });
      void queryClient.invalidateQueries({ queryKey: keys.stats });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
    },
  });
}

/**
 * Move a card to another column.
 *
 * Optimistic: the card jumps immediately and rolls back if the server refuses, so dragging
 * feels instant even on a slow connection.
 */
export function useMoveApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: Status }) =>
      request<Application>(`/applications/${id}`, { method: "PATCH", json: { status } }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: keys.applications });
      const previous = queryClient.getQueryData<Application[]>(keys.applications);
      queryClient.setQueryData<Application[]>(keys.applications, (current) =>
        current?.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(keys.applications, context.previous);
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: keys.applications });
      void queryClient.invalidateQueries({ queryKey: keys.stats });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<void>(`/applications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.applications });
      void queryClient.invalidateQueries({ queryKey: keys.stats });
    },
  });
}
