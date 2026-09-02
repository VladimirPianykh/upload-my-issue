// Обёртка над window.pywebview.api.
//
// pywebview инжектит window.pywebview только после события 'pywebviewready',
// поэтому все вызовы ждут готовности моста (см. _ready ниже).

let _readyPromise = null;

function waitForBridge() {
  if (_readyPromise) return _readyPromise;
  _readyPromise = new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) {
      resolve();
      return;
    }
    window.addEventListener("pywebviewready", () => resolve(), { once: true });
  });
  return _readyPromise;
}

async function call(method, ...args) {
  await waitForBridge();
  return window.pywebview.api[method](...args);
}

export const api = {
  getAppState: () => call("get_app_state"),

  saveGithubToken: (token) => call("save_github_token", token),
  deleteGithubToken: () => call("delete_github_token"),
  hasSavedTokenMasked: () => call("has_saved_token_masked"),

  listRepositories: () => call("list_repositories"),
  selectRepositoryByFullName: (fullName) => call("select_repository_by_full_name", fullName),
  selectRepositoryByUrl: (url) => call("select_repository_by_url", url),
  listRepositoryLabels: () => call("list_repository_labels"),

  listIssues: (opts) =>
    call(
      "list_issues",
      opts.page ?? 1,
      opts.state ?? "open",
      opts.labels ?? null,
      opts.sort ?? "created",
      opts.direction ?? "desc",
      opts.search ?? null
    ),
  refreshIssuesCache: () => call("refresh_issues_cache"),

  openInBrowser: (url) => call("open_in_browser", url),
  chooseDownloadFolder: () => call("choose_download_folder"),
  checkDownloadConflict: (folder, number, title, body) =>
    call("check_download_conflict", folder, number, title, body),
  saveIssueMarkdown: (folder, number, title, body, overwrite = false) =>
    call("save_issue_markdown", folder, number, title, body, overwrite),
  bulkDownload: (folder, issues) => call("bulk_download", folder, issues),

  pasteFromClipboard: () => call("paste_from_clipboard"),
  chooseUploadFiles: () => call("choose_upload_files"),
  chooseUploadFolders: () => call("choose_upload_folders"),
  scanPathsForUpload: (paths) => call("scan_paths_for_upload", paths),
  rescanDirectory: (dir) => call("rescan_directory", dir),
  readAndStageFile: (path) => call("read_and_stage_file", path),
  resolveDuplicate: (pendingItem, existingItemId, action) =>
    call("resolve_duplicate", pendingItem, existingItemId, action),
  getUploadQueue: () => call("get_upload_queue"),
  updateUploadItem: (itemId, title, labels) => call("update_upload_item", itemId, title, labels),
  bulkUpdateLabels: (itemIds, labels) => call("bulk_update_labels", itemIds, labels),
  removeUploadItems: (itemIds) => call("remove_upload_items", itemIds),
  clearUploadQueue: () => call("clear_upload_queue"),
  validateUploadQueue: () => call("validate_upload_queue"),
  submitUpload: (itemIds = null) => call("submit_upload", itemIds),

  cancelJob: (jobId) => call("cancel_job", jobId),

  openSettings: () => call("open_settings"),
  setDownloadDefaultFolder: (folder) => call("set_download_default_folder", folder),
};

export function onBackendEvent(eventName, handler) {
  const listener = (e) => handler(e.detail);
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
