import { useEffect, useState } from "react";
import { api } from "../api";
import { useDialog } from "../dialogs/DialogProvider";

export default function SettingsDialog({ onClose, onAccountChanged }) {
  const ask = useDialog();
  const [maskedToken, setMaskedToken] = useState(null);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloadFolder, setDownloadFolder] = useState(null);

  const refresh = async () => {
    const state = await api.openSettings();
    setMaskedToken(state.masked_token);
    setDownloadFolder(state.download_default_folder);
  };

  useEffect(() => {
    refresh();
  }, []);

  const saveToken = async () => {
    setError(null);
    setBusy(true);
    try {
      const account = await api.saveGithubToken(tokenInput.trim());
      setTokenInput("");
      await refresh();
      onAccountChanged?.(account);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteToken = async () => {
    const { value } = await ask({
      title: "Удалить токен?",
      message: "Сохранённый GitHub-токен будет удалён. Продолжить?",
      options: [
        { value: "cancel", label: "Отмена" },
        { value: "delete", label: "Удалить", danger: true, primary: true },
      ],
    });
    if (value !== "delete") return;
    await api.deleteGithubToken();
    await refresh();
    onAccountChanged?.(null);
  };

  const chooseFolder = async () => {
    const folder = await api.chooseDownloadFolder();
    if (folder) {
      await api.setDownloadDefaultFolder(folder);
      setDownloadFolder(folder);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Настройки</h3>

        <h4 style={{ marginBottom: 4 }}>GitHub-токен</h4>
        <p className="modal-message">
          {maskedToken ? `Сохранён: ${maskedToken}` : "Токен не задан"}
        </p>
        <div className="toolbar">
          <input
            type="password"
            placeholder="ghp_..."
            value={tokenInput}
            style={{ flex: 1 }}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <button className="btn btn-primary" disabled={!tokenInput.trim() || busy} onClick={saveToken}>
            Сохранить и проверить
          </button>
        </div>
        {error && <p className="modal-message" style={{ color: "var(--danger)" }}>{error}</p>}
        {maskedToken && (
          <button className="btn btn-danger" onClick={deleteToken} style={{ marginTop: 6 }}>
            Удалить сохранённый токен
          </button>
        )}

        <h4 style={{ marginTop: 20, marginBottom: 4 }}>Папка скачивания по умолчанию</h4>
        <div className="toolbar">
          <input type="text" readOnly value={downloadFolder || "не задана"} style={{ flex: 1 }} />
          <button className="btn" onClick={chooseFolder}>Выбрать...</button>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
