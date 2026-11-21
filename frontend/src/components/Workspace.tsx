import { useCallback, useEffect, useRef, useState } from "react";

import { useApplications, useMoveApplication, useStats } from "../api/hooks";
import type { Application, Status } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { STAGE_LABEL, matchesQuery } from "../lib/stages";
import { ApplicationDialog } from "./ApplicationDialog";
import { Mark } from "./AuthScreen";
import { Board } from "./Board";
import { PipelineStats } from "./PipelineStats";
import { Toolbar } from "./Toolbar";

interface Toast {
  message: string;
  undo?: () => void;
}

type Editor = { id: number } | "new" | null;

export function Workspace() {
  const { user, signOut } = useAuth();
  const applications = useApplications();
  const stats = useStats();
  const move = useMoveApplication();

  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback((next: Toast) => {
    window.clearTimeout(timer.current);
    setToast(next);
    timer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const items = applications.data ?? [];
  const visible = items.filter((item) => matchesQuery(item, query));
  const editing = editor && editor !== "new" ? items.find((item) => item.id === editor.id) ?? null : null;

  function handleMove(item: Application, status: Status) {
    const from = item.status;
    move.mutate(
      { id: item.id, status },
      {
        onError: (error) => notify({ message: `Could not move ${item.company}. ${error.message}` }),
      },
    );
    notify({
      message: `${item.company} moved to ${STAGE_LABEL[status]}`,
      undo: () => {
        move.mutate({ id: item.id, status: from });
        setToast(null);
      },
    });
  }

  return (
    <div className="workspace">
      <header className="topbar">
        <h1 className="wordmark">
          <Mark /> JobTracker
        </h1>
        <span className="spacer" />
        <span className="muted small topbar-user">{user?.email}</span>
        <button type="button" className="button ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="content">
        <PipelineStats stats={stats.data} isLoading={stats.isPending} />

        <Toolbar
          query={query}
          onQuery={setQuery}
          shown={visible.length}
          total={items.length}
          onAdd={() => setEditor("new")}
        />

        {applications.isError && (
          <p className="error" role="alert">
            Could not load your applications. {applications.error.message}{" "}
            <button type="button" className="button link" onClick={() => void applications.refetch()}>
              Try again
            </button>
          </p>
        )}

        {applications.isSuccess && items.length === 0 && (
          <p className="empty">
            Nothing tracked yet. Add the first job you applied to and drag it forward as things move.
          </p>
        )}

        <Board
          items={visible}
          onOpen={(id) => setEditor({ id })}
          onMove={handleMove}
        />
      </main>

      {(editor === "new" || editing) && (
        <ApplicationDialog
          key={editing?.id ?? "new"}
          item={editing}
          onClose={() => setEditor(null)}
          onDone={(message) => notify({ message })}
        />
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <span>{toast.message}</span>
            {toast.undo && (
              <button type="button" className="button link" onClick={toast.undo}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
