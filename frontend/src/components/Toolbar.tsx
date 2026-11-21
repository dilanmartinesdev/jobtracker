interface Props {
  query: string;
  onQuery: (value: string) => void;
  shown: number;
  total: number;
  onAdd: () => void;
}

export function Toolbar({ query, onQuery, shown, total, onAdd }: Props) {
  return (
    <div className="toolbar">
      <label className="search">
        <span className="sr-only">Search by company or role</span>
        <input
          type="search"
          placeholder="Search company or role"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <p className="muted small" aria-live="polite">
        {query.trim() ? `${shown} of ${total} shown` : `${total} ${total === 1 ? "application" : "applications"}`}
      </p>
      <span className="spacer" />
      <button type="button" className="button primary" onClick={onAdd}>
        Add application
      </button>
    </div>
  );
}
