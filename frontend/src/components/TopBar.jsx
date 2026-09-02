export default function TopBar({
  activeTab,
  onTabChange,
  account,
  currentRepo,
  operationInProgress,
  onOpenRepoDialog,
  onOpenSettings,
}) {
  return (
    <div className="topbar">
      <div className="left">
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => onTabChange("upload")}
          >
            Upload
          </button>
          <button
            className={`tab-btn ${activeTab === "download" ? "active" : ""}`}
            onClick={() => onTabChange("download")}
          >
            Download
          </button>
        </div>

        <div className="repo-indicator">
          <span>{currentRepo || "Репозиторий не выбран"}</span>
          <button
            className="btn btn-icon"
            disabled={operationInProgress}
            title={operationInProgress ? "Нельзя менять репозиторий во время операции" : "Сменить репозиторий"}
            onClick={onOpenRepoDialog}
          >
            Сменить
          </button>
        </div>
      </div>

      <div className="left">
        {account ? (
          <div className="account-badge">
            <img src={account.avatar_url} alt={account.login} />
            <span>{account.login}</span>
          </div>
        ) : (
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>Не авторизован</span>
        )}
        <button className="btn" onClick={onOpenSettings} title="Ctrl+,">
          Настройки
        </button>
      </div>
    </div>
  );
}
