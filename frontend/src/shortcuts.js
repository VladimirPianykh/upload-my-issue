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

// KeyboardEvent.code -> каноническое имя клавиши для основных клавиш numpad.
const NUMPAD_DIGIT_NAMES = {
  Numpad0: "numpad0",
  Numpad1: "numpad1",
  Numpad2: "numpad2",
  Numpad3: "numpad3",
  Numpad4: "numpad4",
  Numpad5: "numpad5",
  Numpad6: "numpad6",
  Numpad7: "numpad7",
  Numpad8: "numpad8",
  Numpad9: "numpad9",
};

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
  if (NUMPAD_DIGIT_NAMES[code]) return NUMPAD_DIGIT_NAMES[code];
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
}

/**
 * Проверяет, соответствует ли событие клавиатуры описанию shortcut'а.
 * `shortcut.key` - каноническое имя клавиши (см. keyNameFromEvent).
 */
export function matchesShortcut(e, { key, ctrl = false, shift = false, alt = false }) {
  if (!!e.ctrlKey !== ctrl) return false;
  if (!!e.shiftKey !== shift) return false;
  if (!!e.altKey !== alt) return false;
  return keyNameFromEvent(e) === key;
}

// Встроенные (пока не настраиваемые пользователем) shortcuts приложения.
// Хранятся по названию клавиши, а не по символу раскладки - см. Раздел 12.
export const SHORTCUTS = {
  OPEN_SETTINGS: { key: "Comma", ctrl: true },
  PASTE: { key: "V", ctrl: true },
  DELETE_SELECTED: { key: "Delete" },
};
