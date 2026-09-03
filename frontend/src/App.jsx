import { useEffect, useState } from "react";
import { api, onBackendEvent } from "./api";
import TopBar from "./components/TopBar";
import RepoDialog from "./components/RepoDialog";
import SettingsDialog from "./components/SettingsDialog";
import UploadScreen from "./components/UploadScreen";
import DownloadScreen from "./components/DownloadScreen";
import { DialogProvider } from "./dialogs/DialogProvider";

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

  // Раздел 12: Ctrl+, открывает настройки.
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

        <div className="content">
          {activeTab === "upload" ? (
            <UploadScreen
              currentRepo={currentRepo}
              hasToken={hasToken}
              onOperationStateChange={setOperationInProgress}
            />
          ) : (
            <DownloadScreen
              currentRepo={currentRepo}
              onOperationStateChange={setOperationInProgress}
              issuesMayBeStale={issuesMayBeStale}
              onIssuesRefreshed={() => setIssuesMayBeStale(false)}
            />
          )}
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
