import { useCallback, useEffect, useState } from "react";
import { api, onBackendEvent } from "../api";
import { useDialog } from "../dialogs/DialogProvider";
import IssueCard from "./IssueCard";
import { SUPPORTED_SORT_FIELDS } from "../constants";

export default function DownloadScreen({ currentRepo, onOperationStateChange }) {
  const ask = useDialog();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState("open");
  const [sort, setSort] = useState("created");
  const [direction, setDirection] = useState("desc");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [repoLabels, setRepoLabels] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [downloadStates, setDownloadStates] = useState({});
  const [defaultFolder, setDefaultFolder] = useState(null);
  const [bulkJob, setBulkJob] = useState(null);

  const load = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listIssues({
        page,
        state,
        labels: labelFilter ? [labelFilter] : null,
        sort,
        direction,
        search: search.trim() || null,
      });
      setIssues(result.issues);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [currentRepo, page, state, sort, direction, search, labelFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [currentRepo, state, sort, direction, search, labelFilter]);

  useEffect(() => {
    if (!currentRepo) return;
    api.listRepositoryLabels().then(setRepoLabels).catch(() => setRepoLabels([]));
  }, [currentRepo]);

  useEffect(() => {
    api.openSettings().then((s) => setDefaultFolder(s.download_default_folder));
  }, []);

  const forceRefresh = async () => {
    await api.refreshIssuesCache();
    await load();
  };

  const ensureFolder = async () => {
    if (defaultFolder) return defaultFolder;
    const folder = await api.chooseDownloadFolder();
    if (folder) setDefaultFolder(folder);
    return folder;
  };

  const downloadOne = async (issue) => {
    const folder = await ensureFolder();
    if (!folder) return;
    setDownloadStates((s) => ({ ...s, [issue.number]: "downloading" }));
    try {
      const check = await api.checkDownloadConflict(folder, issue.number, issue.title, issue.body);
      let overwrite = false;
      if (check.conflict) {
        const { value } = await ask({
          title: "Файл уже существует",
          message: `Файл "${check.filename}" уже существует и отличается по содержимому.`,
          options: [
            { value: "cancel", label: "Отмена" },
            { value: "overwrite", label: "Заменить", danger: true },
          ],
        });
        if (value !== "overwrite") {
          setDownloadStates((s) => ({ ...s, [issue.number]: null }));
          return;
        }
        overwrite = true;
      }
      await api.saveIssueMarkdown(folder, issue.number, issue.title, issue.body, overwrite);
      setDownloadStates((s) => ({ ...s, [issue.number]: "done" }));
    } catch (err) {
      setDownloadStates((s) => ({ ...s, [issue.number]: null }));
      setError(err?.message || String(err));
    }
  };

  const bulkDownload = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const folder = await ensureFolder();
    if (!folder) return;
    const items = issues.filter((i) => ids.includes(i.number)).map((i) => ({
      number: i.number, title: i.title, body: i.body,
    }));
    ids.forEach((n) => setDownloadStates((s) => ({ ...s, [n]: "downloading" })));
    onOperationStateChange?.(true);
    const jobId = await api.bulkDownload(folder, items);
    setBulkJob({ jobId, done: 0, total: items.length });
  };

  useEffect(() => {
    const off1 = onBackendEvent("download-progress", ({ job_id, done, total }) => {
      setBulkJob((prev) => (prev && prev.jobId === job_id ? { ...prev, done, total } : prev));
    });
    const off2 = onBackendEvent("download-done", ({ job_id, saved, errors }) => {
      setBulkJob((prev) => (prev && prev.jobId === job_id ? null : prev));
      onOperationStateChange?.(false);
      setDownloadStates((s) => {
        const next = { ...s };
        for (const n of Object.keys(next)) next[n] = null;
        return next;
      });
      if (errors.length > 0) {
        setError(`Скачано: ${saved.length}. Ошибок: ${errors.length}`);
      }
    });
    return () => { off1(); off2(); };
  }, [onOperationStateChange]);

  const cancelBulk = async () => {
    if (bulkJob) await api.cancelJob(bulkJob.jobId);
  };

  const toggleSelect = (number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(number) ? next.delete(number) : next.add(number);
      return next;
    });
  };

  if (!currentRepo) {
    return <div className="empty-state">Сначала выберите репозиторий вверху экрана.</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {SUPPORTED_SORT_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="desc">desc</option>
          <option value="asc">asc</option>
        </select>
        <select value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)}>
          <option value="">Все labels</option>
          {repoLabels.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
        <input type="text" placeholder="Поиск по title..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn" onClick={forceRefresh}>Обновить</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={selected.size === 0 || !!bulkJob} onClick={bulkDownload}>
          Скачать выбранные ({selected.size})
        </button>
        {bulkJob && (
          <>
            <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{bulkJob.done}/{bulkJob.total}</span>
            <button className="btn btn-danger" onClick={cancelBulk}>Отменить</button>
          </>
        )}
      </div>

      {error && <div className="notice-list" style={{ color: "var(--danger)" }}>{error}</div>}
      {loading && <div className="empty-state">Загрузка...</div>}
      {!loading && issues.length === 0 && <div className="empty-state">Issues не найдены</div>}

      <div className="issue-grid">
        {issues.map((issue) => (
          <IssueCard
            key={issue.number}
            issue={issue}
            selected={selected.has(issue.number)}
            onToggleSelect={toggleSelect}
            onDownload={downloadOne}
            onOpenBrowser={(url) => api.openInBrowser(url)}
            downloadState={downloadStates[issue.number]}
          />
        ))}
      </div>

      <div className="pagination">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Назад</button>
        <span>Страница {page}</span>
        <button className="btn" disabled={issues.length < 10} onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
      </div>
    </div>
  );
}
