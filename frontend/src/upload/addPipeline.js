import { api } from "../api";

/**
 * Общий пайплайн для drag&drop, Ctrl+V и диалогов выбора файлов/папок
 * (раздел 6, 12: "Drag and drop должен обеспечивать тот же результат, что и
 * добавление через Ctrl+V" - оба используют этот же код).
 *
 * @param {string[]} paths - пути, полученные от pywebview (drop/paste) или
 *   из системного диалога выбора файлов/папок.
 * @param {(cfg) => Promise<{value:string, applyToAll:boolean}>} ask - см. useDialog()
 * @returns {Promise<{addedCount:number, notices:string[]}>}
 */
export async function runAddPathsPipeline(paths, ask) {
  const notices = [];

  // -- Шаг 1: обход файловой системы, с Retry/Skip/Apply to all для
  // недоступных папок (раздел 6). --------------------------------------
  let scan = await api.scanPathsForUpload(paths);
  let allFiles = [...scan.files];
  let dirApplyAll = null; // 'retry' | 'skip' | null

  let unreadableDirs = [...scan.unreadable_dirs];
  while (unreadableDirs.length > 0) {
    const dir = unreadableDirs.shift();
    let action = dirApplyAll;
    if (action === null) {
      const choice = await ask({
        title: "Папка недоступна",
        message: `Не удалось прочитать папку: ${dir}`,
        checkbox: "Применить ко всем оставшимся недоступным папкам",
        options: [
          { value: "retry", label: "Retry", primary: true },
          { value: "skip", label: "Skip" },
        ],
      });
      action = choice.value;
      if (choice.applyToAll) dirApplyAll = action;
    }

    if (action === "retry") {
      const retryScan = await api.rescanDirectory(dir);
      allFiles.push(...retryScan.files);
      unreadableDirs.push(...retryScan.unreadable_dirs);
      if (retryScan.skipped_non_markdown.length) {
        notices.push(`Пропущены неподдерживаемые объекты в ${dir}`);
      }
    } else {
      notices.push(`Папка пропущена: ${dir}`);
    }
  }

  if (scan.skipped_non_markdown.length > 0) {
    notices.push(
      `Пропущено неподдерживаемых объектов: ${scan.skipped_non_markdown.length}`
    );
  }

  // -- Шаг 2: подтверждение при >100 файлов (раздел 6). ------------------
  if (allFiles.length > 100) {
    const { value } = await ask({
      title: "Много файлов",
      message: `Найдено ${allFiles.length} Markdown-файлов. Продолжить добавление всех в очередь?`,
      options: [
        { value: "yes", label: "Продолжить", primary: true },
        { value: "no", label: "Отмена" },
      ],
    });
    if (value !== "yes") {
      return { addedCount: 0, notices: [...notices, "Добавление отменено пользователем"] };
    }
  }

  // -- Шаг 3: чтение каждого файла, Retry/Skip/Apply to all при ошибках
  // чтения, и обработка дублей Replace/Keep both/Skip (разделы 6, 8). ----
  let readApplyAll = null; // 'retry' | 'skip' | null
  let addedCount = 0;

  for (const path of allFiles) {
    let staged = null;
    while (staged === null) {
      try {
        staged = await api.readAndStageFile(path);
      } catch (err) {
        let action = readApplyAll;
        if (action === null) {
          const choice = await ask({
            title: "Ошибка чтения файла",
            message: `${path}\n\n${err?.message || err}`,
            checkbox: "Применить ко всем оставшимся ошибкам",
            options: [
              { value: "retry", label: "Retry", primary: true },
              { value: "skip", label: "Skip" },
            ],
          });
          action = choice.value;
          if (choice.applyToAll) readApplyAll = action;
        }
        if (action === "skip") {
          notices.push(`Файл пропущен из-за ошибки: ${path}`);
          staged = { status: "skip" };
        }
        // action === 'retry' -> цикл while повторит попытку чтения
      }
    }

    if (staged.status === "skip") continue;

    if (staged.status === "duplicate") {
      const { value } = await ask({
        title: "Дубликат найден",
        message: `Файл "${staged.new_item.title}" совпадает по title и содержимому с элементом уже в очереди.`,
        options: [
          { value: "replace", label: "Replace" },
          { value: "keep_both", label: "Keep both" },
          { value: "skip", label: "Skip", primary: true },
        ],
      });
      await api.resolveDuplicate(staged.new_item, staged.existing_item_id, value);
      if (value !== "skip") addedCount += 1;
      continue;
    }

    addedCount += 1;
  }

  return { addedCount, notices };
}
