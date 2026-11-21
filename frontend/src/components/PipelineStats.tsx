import type { CSSProperties } from "react";

import type { Stats } from "../api/types";
import { formatPercent, formatWeek } from "../lib/format";

interface Props {
  stats: Stats | undefined;
  isLoading?: boolean;
  /** Set on the sign-in screen, where the numbers are an example and not the user's own. */
  sample?: boolean;
}

interface Row {
  label: string;
  count: number;
  share: number;
  note: string;
  tone: "applied" | "interview" | "offer";
}

function buildRows(stats: Stats): Row[] {
  const share = (count: number) => (stats.total === 0 ? 0 : (count / stats.total) * 100);
  return [
    { label: "Sent", count: stats.total, share: 100, note: "", tone: "applied" },
    {
      label: "Interviews",
      count: stats.reached_interview,
      share: share(stats.reached_interview),
      note: formatPercent(stats.interview_rate),
      tone: "interview",
    },
    {
      label: "Offers",
      count: stats.reached_offer,
      share: share(stats.reached_offer),
      note: formatPercent(stats.offer_rate),
      tone: "offer",
    },
  ];
}

export function PipelineStats({ stats, isLoading = false, sample = false }: Props) {
  const heading = sample ? "A search, at a glance" : "Your pipeline";

  if (!stats && isLoading) {
    return (
      <section className="pipeline" aria-busy="true" aria-label={heading}>
        <h2>{heading}</h2>
        <p className="muted">Loading your numbers…</p>
      </section>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <section className="pipeline" aria-label={heading}>
        <h2>{heading}</h2>
        <p className="muted">
          Add your first application and this fills in with how many reach an interview and an offer.
        </p>
      </section>
    );
  }

  const rows = buildRows(stats);
  const busiestWeek = Math.max(1, ...stats.weekly.map((week) => week.count));
  const weeklyTotal = stats.weekly.reduce((sum, week) => sum + week.count, 0);

  return (
    <section className="pipeline" aria-label={heading}>
      <div className="pipeline-funnel">
        <h2>{heading}</h2>
        <ol className="funnel">
          {rows.map((row) => (
            <li key={row.label} className="funnel-row">
              <span className="funnel-label">{row.label}</span>
              <span className="funnel-track">
                <span
                  className={`funnel-bar tone-${row.tone}`}
                  style={{ "--share": row.share } as CSSProperties}
                  data-testid={`bar-${row.tone}`}
                >
                  <span className="funnel-count">{row.count}</span>
                </span>
                {row.note && (
                  <span className="funnel-note">
                    {row.note}
                    <span className="funnel-note-more"> of applications</span>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
        {sample && <p className="muted small">Example numbers. Yours appear once you sign in.</p>}
      </div>

      <div className="pipeline-weeks">
        <h3>Sent per week</h3>
        <div
          className="weeks"
          role="img"
          aria-label={`${weeklyTotal} applications sent in the last 8 weeks. Busiest week had ${busiestWeek}.`}
        >
          {stats.weekly.map((week) => (
            <div key={week.week_start} className="week" title={`Week of ${formatWeek(week.week_start)}: ${week.count}`}>
              <span className="week-bar" style={{ height: `${(week.count / busiestWeek) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="weeks-axis" aria-hidden="true">
          <span>{formatWeek(stats.weekly[0]?.week_start ?? "")}</span>
          <span>This week</span>
        </div>
      </div>
    </section>
  );
}
