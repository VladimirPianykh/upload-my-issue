import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, onBackendEvent } from "../api";
import { useDialog } from "../dialogs/DialogProvider";
import { runAddPathsPipeline } from "../upload/addPipeline";
import UploadCard from "./UploadCard";

export default function UploadScreen({ currentRepo, hasToken, onOperationStateChange }) {
  const ask = useDialog();
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [repoLabels, setRepoLabels] = useState([]);
  const [notices, setNotices] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("none");
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [submitJobId, setSubmitJobId] = useState(null);

  const refreshQueue = useCallback(async () => {
    const q = await api.getUploadQueue();
    setQueue(q);
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (!currentRepo || !hasToken) {
      setRepoLabels([]);
      return;
    }
    api.listRepositoryLabels().then(setRepoLabels).catch(() => setRepoLabels([]));
  }, [currentRepo, hasToken]);

  // Раздел 6/12: нативный drag&drop и Ctrl+V прилетают из Python как одно и
  // то же событие - оба идут через один и тот же пайплайн.
  useEffect(() => {
    return onBackendEvent("native-paths-added", async ({ paths }) => {
      if (!paths?.length) return;
      const { addedCount, notices: n } = await runAddPathsPipeline(paths, ask);
      await refreshQueue();
      setNotices(n.length ? n : addedCount ? [`Добавлено файлов: ${addedCount}`] : []);
    });
  }, [ask, refreshQueue]);

  useEffect(() => {
    const off1 = onBackendEvent("upload-progress", ({ done, total }) => setProgress({ done, total }));
    const off2 = onBackendEvent("upload-done", async ({ succeeded, failed, remaining_queue }) => {
      setSubmitting(false);
      setProgress(null);
      setSubmitJobId(null);
      onOperationStateChange?.(false);
      setQueue(remaining_queue);
      if (failed.length > 0) {
        const { value } = await ask({
          title: "Часть Issues не создана",
          message:
            `Успешно создано: ${succeeded}. Ошибок: ${failed.length}.\n\n` +
            failed.map((f) => `• ${f.error}`).join("\n"),
          options: [
            { value: "stop", label: "Оставить как есть" },
            { value: "retry", label: "Повторить неуспешные", primary: true },
          ],
        });
        if (value === "retry") {
          setSubmitting(true);
          onOperationStateChange?.(true);
          const jobId = await api.submitUpload(failed.map((f) => f.item_id));
          setSubmitJobId(jobId);
        }
      } else if (remaining_queue.length > 0) {
        setNotices([
          `Операция прервана. Успешно создано: ${succeeded}. Осталось в очереди: ${remaining_queue.length}.`,
        ]);
      } else {
        setNotices([`Успешно создано Issues: ${succeeded}`]);
      }
    });
    return () => { off1(); off2(); };
  }, [ask, onOperationStateChange]);

  const cancelSubmit = async () => {
    if (submitJobId) await api.cancelJob(submitJobId);
  };

  const addViaFiles = async () => {
    const files = await api.chooseUploadFiles();
    if (!files?.length) return;
    const { addedCount, notices: n } = await runAddPathsPipeline(files, ask);
    await refreshQueue();
    setNotices(n.length ? n : addedCount ? [`Добавлено файлов: ${addedCount}`] : []);
  };

  const addViaFolders = async () => {
    const folders = await api.chooseUploadFolders();
    if (!folders?.length) return;
    const { addedCount, notices: n } = await runAddPathsPipeline(folders, ask);
    await refreshQueue();
    setNotices(n.length ? n : addedCount ? [`Добавлено файлов: ${addedCount}`] : []);
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(displayedQueue.map((i) => i.id)));
  const clearSelection = () => setSelected(new Set());

  const deleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    const { value } = await ask({
      title: "Удалить выбранные карточки?",
      message: `Будет удалено карточек: ${selected.size}.`,
      options: [
        { value: "cancel", label: "Отмена" },
        { value: "delete", label: "Удалить", danger: true, primary: true },
      ],
    });
    if (value !== "delete") return;
    const remaining = await api.removeUploadItems([...selected]);
    setQueue(remaining);
    setSelected(new Set());
  }, [ask, selected]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Delete") deleteSelected();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelected]);

  // Раздел 6/12: Ctrl+V должен давать тот же результат, что и drag&drop.
  useEffect(() => {
    const handler = async (e) => {
      if (!(e.ctrlKey && e.key.toLowerCase() === "v")) return;
      const active = document.activeElement;
      const isEditable = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isEditable) return; // не мешаем обычной вставке текста в поля
      e.preventDefault();
      const paths = await api.pasteFromClipboard();
      if (!paths?.length) return;
      const { addedCount, notices: n } = await runAddPathsPipeline(paths, ask);
      await refreshQueue();
      setNotices(n.length ? n : addedCount ? [`Добавлено файлов: ${addedCount}`] : []);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ask, refreshQueue]);

  const onTitleChange = async (id, title) => {
    setQueue((prev) => prev.map((i) => (i.id === id ? { ...i, title } : i)));
    await api.updateUploadItem(id, title, null);
  };

  const onToggleLabel = async (id, labelName) => {
    const item = queue.find((i) => i.id === id);
    if (!item) return;
    const nextLabels = item.labels.includes(labelName)
      ? item.labels.filter((l) => l !== labelName)
      : [...item.labels, labelName];
    setQueue((prev) => prev.map((i) => (i.id === id ? { ...i, labels: nextLabels } : i)));
    await api.updateUploadItem(id, null, nextLabels);
  };

  const applyLabelsToSelected = async (labelName) => {
    if (selected.size === 0) return;
    const ids = [...selected];
    const items = queue.filter((i) => ids.includes(i.id));
    const allHave = items.every((i) => i.labels.includes(labelName));
    for (const item of items) {
      const nextLabels = allHave
        ? item.labels.filter((l) => l !== labelName)
        : [...new Set([...item.labels, labelName])];
      await api.updateUploadItem(item.id, null, nextLabels);
    }
    await refreshQueue();
  };

  const submit = async () => {
    const validation = await api.validateUploadQueue();
    await refreshQueue();
    if (!validation.ok) {
      setNotices(["Локальная проверка не пройдена — исправьте отмеченные карточки"]);
      return;
    }
    if (queue.length > 10) {
      const { value } = await ask({
        title: "Подтвердите отправку",
        message: `Будет создано Issues: ${queue.length}. Продолжить?`,
        options: [
          { value: "cancel", label: "Отмена" },
          { value: "send", label: "Отправить", primary: true },
        ],
      });
      if (value !== "send") return;
    }
    setSubmitting(true);
    onOperationStateChange?.(true);
    const jobId = await api.submitUpload(null);
    setSubmitJobId(jobId);
  };

  const displayedQueue = useMemo(() => {
    let result = queue;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) => i.title.toLowerCase().includes(q) || i.original_filename.toLowerCase().includes(q)
      );
    }
    if (sortBy === "title") {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "filename") {
      result = [...result].sort((a, b) => a.original_filename.localeCompare(b.original_filename));
    } else if (sortBy === "errors") {
      result = [...result].sort((a, b) => (b.error ? 1 : 0) - (a.error ? 1 : 0));
    }
    return result;
  }, [queue, search, sortBy]);

  if (!currentRepo) {
    return <div className="empty-state">Сначала выберите репозиторий вверху экрана.</div>;
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => { e.preventDefault(); setDragActive(false); }}
    >
      <div className={`dropzone ${dragActive ? "active" : ""}`}>
        Перетащите сюда .md/.markdown файлы или папки, либо вставьте (Ctrl+V) из проводника
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn" onClick={addViaFiles}>Добавить файлы...</button>
          <button className="btn" onClick={addViaFolders}>Добавить папку...</button>
        </div>
      </div>

      {notices.length > 0 && (
        <div className="notice-list">{notices.map((n, i) => <div key={i}>{n}</div>)}</div>
      )}

      <div className="toolbar">
        <input type="text" placeholder="Поиск по очереди..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="none">Без сортировки</option>
          <option value="title">По title</option>
          <option value="filename">По имени файла</option>
          <option value="errors">Сначала с ошибками</option>
        </select>
        <button className="btn" onClick={selectAll}>Select All</button>
        <button className="btn" onClick={clearSelection}>Снять выделение</button>
        <button className="btn btn-danger" disabled={selected.size === 0} onClick={deleteSelected}>
          Удалить выбранные ({selected.size})
        </button>
        {repoLabels.length > 0 && selected.size > 0 && (
          <select onChange={(e) => e.target.value && applyLabelsToSelected(e.target.value)} value="">
            <option value="" disabled>Применить label к выбранным...</option>
            {repoLabels.map((l) => (
              <option key={l.name} value={l.name}>{l.name}</option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Всего в очереди: {queue.length}</span>
        <button className="btn btn-primary" disabled={queue.length === 0 || submitting} onClick={submit}>
          {submitting ? `Отправка... ${progress ? `${progress.done}/${progress.total}` : ""}` : "Отправить в GitHub"}
        </button>
        {submitting && (
          <button className="btn btn-danger" onClick={cancelSubmit}>Прервать</button>
        )}
      </div>

      <div className="upload-grid">
        {displayedQueue.length === 0 && <div className="empty-state">Очередь пуста</div>}
        {displayedQueue.map((item) => (
          <UploadCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggleSelect={toggleSelect}
            onTitleChange={onTitleChange}
            onToggleLabel={onToggleLabel}
            repoLabels={repoLabels}
          />
        ))}
      </div>
    </div>
  );
}
