import { useEffect, useState } from "react";
import { api } from "../api";

export default function RepoDialog({ onClose, onSelected }) {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(null);
  const [repos, setRepos] = useState(null); // null = загрузка
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRepos = async () => {
    setRepos(null);
    setLoadError(null);
    try {
      const list = await api.listRepositories();
      setRepos(list);
    } catch (err) {
      setLoadError(err?.message || String(err));
    }
  };

  // Раздел 3: список загружается заново при каждом открытии диалога.
  useEffect(() => {
    loadRepos();
  }, []);

  const submitUrl = async () => {
    setUrlError(null);
    setBusy(true);
    try {
      const repo = await api.selectRepositoryByUrl(url.trim());
      onSelected(repo);
    } catch (err) {
      setUrlError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const selectFromList = async (fullName) => {
    setBusy(true);
    setUrlError(null);
    try {
      const repo = await api.selectRepositoryByFullName(fullName);
      onSelected(repo);
    } catch (err) {
      setUrlError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const filtered = (repos || []).filter((r) =>
    r.full_name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Выбор репозитория</h3>

        <div className="toolbar">
          <input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={url}
            style={{ flex: 1 }}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && url.trim() && submitUrl()}
          />
          <button className="btn btn-primary" disabled={!url.trim() || busy} onClick={submitUrl}>
            Открыть
          </button>
        </div>
        {urlError && <p className="modal-message" style={{ color: "var(--danger)" }}>{urlError}</p>}

        <div className="toolbar">
          <input
            type="text"
            placeholder="Поиск по репозиториям аккаунта..."
            value={query}
            style={{ flex: 1 }}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" onClick={loadRepos}>Обновить список</button>
        </div>

        <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          {repos === null && !loadError && <div className="empty-state">Загрузка...</div>}
          {loadError && <div className="empty-state" style={{ color: "var(--danger)" }}>{loadError}</div>}
          {repos !== null && filtered.length === 0 && !loadError && (
            <div className="empty-state">Ничего не найдено</div>
          )}
          {filtered.map((r) => (
            <div
              key={r.full_name}
              onClick={() => !busy && selectFromList(r.full_name)}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: busy ? "default" : "pointer",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                <strong>{r.name}</strong>{" "}
                <span style={{ color: "var(--text-dim)" }}>· {r.owner}</span>
              </span>
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
                {r.private ? "private" : "public"}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
