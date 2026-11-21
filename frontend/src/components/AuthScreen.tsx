import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import type { Stats } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PipelineStats } from "./PipelineStats";

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;

const SAMPLE_STATS: Stats = {
  total: 18,
  by_status: { applied: 7, interview: 4, offer: 2, rejected: 5 },
  reached_interview: 8,
  reached_offer: 2,
  interview_rate: 8 / 18,
  offer_rate: 2 / 18,
  weekly: [
    { week_start: "2026-09-21", count: 2 },
    { week_start: "2026-09-28", count: 3 },
    { week_start: "2026-10-05", count: 1 },
    { week_start: "2026-10-12", count: 4 },
    { week_start: "2026-10-19", count: 2 },
    { week_start: "2026-10-26", count: 3 },
    { week_start: "2026-11-02", count: 2 },
    { week_start: "2026-11-09", count: 1 },
  ],
};

type Mode = "signin" | "register";

export function AuthScreen() {
  const { signIn, register, notice } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void run(() => (isRegister ? register(email, password) : signIn(email, password)));
  }

  return (
    <main className="auth">
      <div className="auth-intro">
        <p className="wordmark">
          <Mark /> JobTracker
        </p>
        <h1>Know where every application stands.</h1>
        <p className="lede">
          Drag applications from Applied to Interview to Offer, and see how many make it through each
          step.
        </p>
        <PipelineStats stats={SAMPLE_STATS} sample />
      </div>

      <div className="auth-panel">
        <h2>{isRegister ? "Create your account" : "Sign in"}</h2>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <form onSubmit={handleSubmit} className="stack">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 8 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {isRegister && <small className="muted">At least 8 characters.</small>}
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "One moment…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          className="button link"
          onClick={() => {
            setMode(isRegister ? "signin" : "register");
            setError(null);
          }}
        >
          {isRegister ? "I already have an account" : "Create an account"}
        </button>

        {DEMO_EMAIL && DEMO_PASSWORD && (
          <div className="demo">
            <p className="muted small">Just looking?</p>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void run(() => signIn(DEMO_EMAIL, DEMO_PASSWORD))}
            >
              Explore with the demo account
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <rect x="6" y="8" width="20" height="4" rx="1.5" fill="#4F6D8A" />
      <rect x="6" y="14" width="14" height="4" rx="1.5" fill="#E0A53A" />
      <rect x="6" y="20" width="8" height="4" rx="1.5" fill="#3FA079" />
    </svg>
  );
}
