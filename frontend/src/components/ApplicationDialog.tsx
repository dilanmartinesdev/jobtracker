import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import {
  useCreateApplication,
  useDeleteApplication,
  useHistory,
  useUpdateApplication,
} from "../api/hooks";
import { STATUSES, type Application, type ApplicationInput, type Status } from "../api/types";
import { toDayString, formatDateTime } from "../lib/format";
import { STAGE_LABEL } from "../lib/stages";

interface Props {
  /** The application being edited, or null to create a new one. */
  item: Application | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

interface Values {
  company: string;
  position: string;
  status: Status;
  appliedDate: string;
  location: string;
  url: string;
  notes: string;
}

function initialValues(item: Application | null): Values {
  return {
    company: item?.company ?? "",
    position: item?.position ?? "",
    status: item?.status ?? "applied",
    appliedDate: item?.applied_date ?? toDayString(new Date()),
    location: item?.location ?? "",
    url: item?.url ?? "",
    notes: item?.notes ?? "",
  };
}

function toInput(values: Values): ApplicationInput {
  return {
    company: values.company.trim(),
    position: values.position.trim(),
    status: values.status,
    applied_date: values.appliedDate,
    location: values.location.trim() || null,
    url: values.url.trim() || null,
    notes: values.notes.trim() || null,
  };
}

const isWebLink = (value: string) => /^https?:\/\//i.test(value);

/**
 * Create / edit form in a native <dialog>. showModal() gives focus trapping, Escape to close and
 * an inert page behind it, so none of that has to be hand-built.
 */
export function ApplicationDialog({ item, onClose, onDone }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(() => initialValues(item));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const create = useCreateApplication();
  const update = useUpdateApplication();
  const remove = useDeleteApplication();
  const history = useHistory(item?.id ?? null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const isNew = item === null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // New: start typing in the first field. Existing: land on the title so a screen reader reads
    // it, instead of on the Close button, which is what the browser would pick.
    dialog.querySelector<HTMLElement>(isNew ? "input" : "h2")?.focus();
  }, [isNew]);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const input = toInput(values);
      if (item) await update.mutateAsync({ id: item.id, changes: input });
      else await create.mutateAsync(input);
      onDone(item ? "Changes saved" : `Added ${input.company}`);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save. Try again.");
    }
  }

  async function handleDelete() {
    if (!item) return;
    setError(null);
    try {
      await remove.mutateAsync(item.id);
      onDone(`Deleted ${item.company}`);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete. Try again.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the dimmed backdrop lands on the <dialog> element itself.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="dialog-form">
        <header className="dialog-head">
          <h2 id="dialog-title" tabIndex={-1}>
            {item ? "Edit application" : "Add application"}
          </h2>
          <button type="button" className="button ghost" onClick={() => dialogRef.current?.close()}>
            Close
          </button>
        </header>

        <div className="dialog-body">
          <div className="field-row">
            <label className="field">
              <span>Company</span>
              <input
                required
                maxLength={120}
                value={values.company}
                onChange={(event) => set("company", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Role</span>
              <input
                required
                maxLength={120}
                value={values.position}
                onChange={(event) => set("position", event.target.value)}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Stage</span>
              <select value={values.status} onChange={(event) => set("status", event.target.value as Status)}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STAGE_LABEL[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Applied on</span>
              <input
                type="date"
                required
                value={values.appliedDate}
                onChange={(event) => set("appliedDate", event.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Location</span>
            <input maxLength={120} value={values.location} onChange={(event) => set("location", event.target.value)} />
          </label>

          <label className="field">
            <span>Job posting link</span>
            <input
              type="url"
              maxLength={500}
              placeholder="https://"
              value={values.url}
              onChange={(event) => set("url", event.target.value)}
            />
            {item?.url && isWebLink(item.url) && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="small">
                Open posting in a new tab
              </a>
            )}
          </label>

          <label className="field">
            <span>Notes</span>
            <textarea
              rows={4}
              maxLength={5000}
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
            />
          </label>

          {item && (
            <section aria-labelledby="history-title" className="history">
              <h3 id="history-title">History</h3>
              {history.isPending && <p className="muted small">Loading…</p>}
              {history.data && (
                <ol className="timeline">
                  {[...history.data].reverse().map((event) => (
                    <li key={event.id}>
                      <span>
                        {event.from_status === null
                          ? `Added as ${STAGE_LABEL[event.to_status]}`
                          : `Moved from ${STAGE_LABEL[event.from_status]} to ${STAGE_LABEL[event.to_status]}`}
                      </span>
                      <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="dialog-foot">
          {item && !confirmingDelete && (
            <button type="button" className="button danger-ghost" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
          {item && confirmingDelete && (
            <span className="confirm">
              <span>Delete this application? This can’t be undone.</span>
              <button type="button" className="button" onClick={() => setConfirmingDelete(false)}>
                Keep it
              </button>
              <button type="button" className="button danger" disabled={busy} onClick={() => void handleDelete()}>
                Yes, delete
              </button>
            </span>
          )}
          <span className="spacer" />
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : item ? "Save changes" : "Add application"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
