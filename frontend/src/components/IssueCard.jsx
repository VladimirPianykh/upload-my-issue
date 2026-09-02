export default function IssueCard({ issue, selected, onToggleSelect, onDownload, onOpenBrowser, downloadState }) {
  return (
    <div className="issue-card">
      <input
        type="checkbox"
        checked={selected}
        disabled={issue.is_pull_request}
        onChange={() => onToggleSelect(issue.number)}
      />
      <div style={{ flex: 1 }}>
        <div className="title">
          #{issue.number} {issue.title}
          {issue.is_pull_request && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-dim)" }}>(Pull Request — не экспортируется)</span>
          )}
        </div>
        <div className="meta">
          <span className={`state-pill ${issue.state}`}>{issue.state}</span>
        </div>
        {issue.labels?.length > 0 && (
          <div className="labels-row">
            {issue.labels.map((l) => (
              <span key={l.name} className="label-chip" style={{ background: `#${l.color}` }}>
                {l.name}
              </span>
            ))}
          </div>
        )}
        <div className="issue-actions">
          <button className="btn" disabled={issue.is_pull_request || downloadState === "downloading"} onClick={() => onDownload(issue)}>
            {downloadState === "downloading" ? "Скачивание..." : downloadState === "done" ? "Скачано ✓" : "Download"}
          </button>
          <button className="btn" onClick={() => onOpenBrowser(issue.html_url)}>Open in Browser</button>
        </div>
      </div>
    </div>
  );
}
