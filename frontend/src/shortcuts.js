import { useEffect, useRef } from "react";
import { useAnyDialogOpen } from "./dialogGate";

/**
 * Раздел 12: shortcuts должны работать одинаково при любой раскладке
 * клавиатуры — определяться по физической клавише (KeyboardEvent.code),
 * а не по символу, который эта клавиша вводит в текущей раскладке
 * (KeyboardEvent.key).
 *
 * KeyboardEvent.ctrlKey/shiftKey/altKey уже не различают левый и правый
 * вариант модификатора и не зависят от Caps Lock / Num Lock / Scroll Lock,
 * поэтому для них никакой дополнительной нормализации не требуется.
 */

const LETTER_KEY = /^Key([A-Z])$/;
const DIGIT_KEY = /^Digit([0-9])$/;
const NUMPAD_DIGIT_KEY = /^Numpad([0-9])$/;

/**
 * Возвращает каноническое, независимое от раскладки имя физической клавиши.
 * - Буквенные клавиши -> соответствующая латинская буква ("KeyV" -> "V").
 * - Цифровые клавиши -> цифра ("Digit1" -> "1").
 * - Numpad 0-9 -> "numpad<N>".
 * - Остальные (специальные) клавиши -> их собственное имя из `code` как есть
 *   ("Comma", "Delete", "Enter", "Escape", "NumpadAdd", ...).
 */
export function keyNameFromEvent(e) {
  const code = e.code || "";
  const numpadMatch = NUMPAD_DIGIT_KEY.exec(code);
  return (
    LETTER_KEY.exec(code)?.[1] ??
    DIGIT_KEY.exec(code)?.[1] ??
    (numpadMatch && `numpad${numpadMatch[1]}`) ??
    code
  );
}

/**
 * Является ли элемент полем ввода текста (input/textarea), в котором
 * должно сохраняться стандартное поведение браузера (например, свой
 * Ctrl+A для выделения текста, свой Ctrl+V для вставки текста).
 */
export function isEditableTarget(el) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

/**
 * Проверяет, соответствует ли событие клавиатуры описанию shortcut'а.
 * `shortcut.key` - каноническое имя клавиши (см. keyNameFromEvent).
 */
export function matchesShortcut(e, { key, ctrl = false, shift = false, alt = false }) {
  return (
    !!e.ctrlKey === ctrl &&
    !!e.shiftKey === shift &&
    !!e.altKey === alt &&
    keyNameFromEvent(e) === key
  );
}

// Встроенные (пока не настраиваемые пользователем) shortcuts приложения.
// Хранятся по названию клавиши, а не по символу раскладки - см. Раздел 12.
export const SHORTCUTS = {
  OPEN_SETTINGS: { key: "Comma", ctrl: true },
  PASTE: { key: "V", ctrl: true },
  DELETE_SELECTED: { key: "Delete" },
  // Additional shortcuts.md: переключение фокуса между вкладками Upload/Download.
  FOCUS_UPLOAD_TAB: { key: "BracketLeft", ctrl: true },
  FOCUS_DOWNLOAD_TAB: { key: "BracketRight", ctrl: true },
  // Additional shortcuts.md: снятие выделения / выделение всех элементов
  // активной вкладки.
  DESELECT: { key: "Escape" },
  SELECT_ALL: { key: "A", ctrl: true },
};

/**
 * Подписывает `handler` на глобальный shortcut, независимый от раскладки.
 * `handler` не обязан быть мемоизирован - актуальная версия читается из
 * ref, поэтому слушатель `keydown` переподписывается только при смене
 * самого shortcut'а, а не при каждом рендере компонента.
 *
 * Additional shortcuts.md: "Сочетания не обрабатываются при открытом
 * внутреннем диалоге приложения" - действует для всех shortcut'ов сразу,
 * через общий DialogOpenProvider (см. dialogGate.jsx).
 */
export function useShortcut(shortcut, handler) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const anyDialogOpen = useAnyDialogOpen();
  const anyDialogOpenRef = useRef(anyDialogOpen);
  useEffect(() => {
    anyDialogOpenRef.current = anyDialogOpen;
  }, [anyDialogOpen]);

  useEffect(() => {
    const listener = (e) => {
      if (anyDialogOpenRef.current) return;
      if (matchesShortcut(e, shortcut)) handlerRef.current(e);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [shortcut]);
}
