import { useEffect, useState } from "react";
import { api, onBackendEvent } from "./api";
import TopBar from "./components/TopBar";
import RepoDialog from "./components/RepoDialog";
import SettingsDialog from "./components/SettingsDialog";
import UploadScreen from "./components/UploadScreen";
import DownloadScreen from "./components/DownloadScreen";
import { DialogProvider } from "./dialogs/DialogProvider";
import { SHORTCUTS, useShortcut } from "./shortcuts";

export default function App() {
  const [activeTab, setActiveTab] = useState("upload");
  const [account, setAccount] = useState(null);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [hasToken, setHasToken] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState(false);
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Живёт на уровне App (не внутри DownloadScreen), т.к. issues-changed может
  // прийти, пока экран Download размонтирован (например, аплоад идёт на
  // экране Upload) - тогда сам DownloadScreen не может его поймать.
  const [issuesMayBeStale, setIssuesMayBeStale] = useState(false);

  const refreshState = async () => {
    const state = await api.getAppState();
    setAccount(state.account);
    setCurrentRepo(state.current_repo);
    setHasToken(state.has_token);
    setOperationInProgress(state.operation_in_progress);
    if (!state.has_token) setSettingsOpen(true);
  };

  useEffect(() => {
    refreshState();
  }, []);

  useEffect(() => onBackendEvent("issues-changed", () => setIssuesMayBeStale(true)), []);

  // Раздел 12: Ctrl+, открывает настройки. Определяется по физической
  // клавише, поэтому срабатывает независимо от активной раскладки.
  useShortcut(SHORTCUTS.OPEN_SETTINGS, (e) => {
    e.preventDefault();
    setSettingsOpen(true);
  });

  // Additional shortcuts.md: Ctrl+[ / Ctrl+] переводят фокус на вкладку
  // Upload/Download независимо от того, какая вкладка сейчас активна.
  // Срабатывают даже при фокусе в поле ввода (в отличие от Ctrl+V) - см.
  // useShortcut/SHORTCUTS в shortcuts.js, где нет проверки isEditableTarget.
  useShortcut(SHORTCUTS.FOCUS_UPLOAD_TAB, (e) => {
    e.preventDefault();
    setActiveTab("upload");
  });
  useShortcut(SHORTCUTS.FOCUS_DOWNLOAD_TAB, (e) => {
    e.preventDefault();
    setActiveTab("download");
  });

  const isUploadActive = activeTab === "upload";
  const isDownloadActive = activeTab === "download";

  return (
    <DialogProvider>
      <div className="app">
        <TopBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          account={account}
          currentRepo={currentRepo}
          operationInProgress={operationInProgress}
          onOpenRepoDialog={() => setRepoDialogOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/*
          Additional shortcuts.md: выделение элементов на одной вкладке
          должно сохраняться при переключении на другую и обратно. Раз оба
          экрана держат выделение в собственном React-состоянии, для этого
          оба должны оставаться смонтированными постоянно - переключение
          вкладок скрывает неактивный экран через CSS, а не размонтирует
          его.
        */}
        <div className="content">
          <div hidden={!isUploadActive}>
            <UploadScreen
              isActive={isUploadActive}
              currentRepo={currentRepo}
              hasToken={hasToken}
              onOperationStateChange={setOperationInProgress}
            />
          </div>
          <div hidden={!isDownloadActive}>
            <DownloadScreen
              isActive={isDownloadActive}
              currentRepo={currentRepo}
              onOperationStateChange={setOperationInProgress}
              issuesMayBeStale={issuesMayBeStale}
              onIssuesRefreshed={() => setIssuesMayBeStale(false)}
            />
          </div>
        </div>

        {repoDialogOpen && (
          <RepoDialog
            onClose={() => setRepoDialogOpen(false)}
            onSelected={(repo) => {
              setCurrentRepo(repo.full_name);
              setRepoDialogOpen(false);
            }}
          />
        )}

        {settingsOpen && (
          <SettingsDialog
            onClose={() => setSettingsOpen(false)}
            onAccountChanged={(acc) => {
              setHasToken(!!acc);
              setAccount(acc);
            }}
          />
        )}
      </div>
    </DialogProvider>
  );
}
