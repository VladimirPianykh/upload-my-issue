export default function UploadCard({ item, selected, onToggleSelect, onTitleChange, onToggleLabel, repoLabels }) {
  return (
    <div className={`upload-card ${item.error ? "has-error" : ""}`}>
      <div className="check">
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(item.id)} />
      </div>
      <div className="body">
        <input
          className="title-input"
          value={item.title}
          onChange={(e) => onTitleChange(item.id, e.target.value)}
        />
        <div className="filename">{item.original_filename}</div>
        <div className="preview">{item.body.slice(0, 220)}</div>

        {repoLabels?.length > 0 && (
          <div className="labels-row">
            {repoLabels.map((l) => {
              const isSelected = item.labels.includes(l.name);
              return (
                <span
                  key={l.name}
                  className={`label-chip selectable ${isSelected ? "selected" : ""}`}
                  style={{ background: `#${l.color}`, borderColor: `#${l.color}` }}
                  onClick={() => onToggleLabel(item.id, l.name)}
                >
                  {l.name}
                </span>
              );
            })}
          </div>
        )}

        {item.error && (
          <div className="error-banner">⚠ {item.error}</div>
        )}
      </div>
    </div>
  );
}
