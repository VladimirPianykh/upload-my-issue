/**
 * Dependency filter.md, раздел 2: разбор поисковой строки с конструкциями
 * фильтрации зависимостей. Модуль чистый: контекст автодополнения целиком
 * определяется текстом и положением каретки, поэтому ввод, вставка из буфера
 * обмена и перемещение каретки подчиняются одним и тем же правилам.
 *
 * Реестр DEPENDENCY_CONSTRUCTS расширяем: новая конструкция - новая запись
 * (токен должен начинаться с "!" и заканчиваться "#").
 */

export const DEPENDENCY_CONSTRUCTS = [
  { token: "!dep#", mode: "dependencies", label: "Зависимости" },
  { token: "!idep#", mode: "dependents", label: "Зависимые" },
  { token: "!rel#", mode: "relates_to", label: "Relates to" },
  { token: "!con#", mode: "connected", label: "Любая связь" },
];

const CONSTRUCT_TRIGGER = "!";
const WHITESPACE = /\s/;

function wordBounds(text, caret) {
  let start = caret;
  while (start > 0 && !WHITESPACE.test(text[start - 1])) start--;
  let end = start;
  while (end < text.length && !WHITESPACE.test(text[end])) end++;
  return { start, end };
}

/**
 * Контекст автодополнения для каретки `caret` в `text` или null, если
 * автодополнение для этой позиции не предусмотрено.
 *
 * - { kind: "construct", start, end, options } - слово под кареткой является
 *   началом одной или нескольких конструкций (предлагаем их);
 * - { kind: "issue", start, end, construct, query } - слово начинается с
 *   конструкции, каретка стоит после `#` и не дальше конца слова (ищем issue
 *   по `query`; [start, end) - то, что удаляется при выборе карточки).
 */
export function getAutocompleteContext(text, caret) {
  const { start, end } = wordBounds(text, caret);
  const word = text.slice(start, end);

  const construct = DEPENDENCY_CONSTRUCTS.find((c) => word.startsWith(c.token));
  if (construct) {
    const queryStart = start + construct.token.length;
    if (caret < queryStart) return null;
    return { kind: "issue", start, end, construct, query: text.slice(queryStart, end) };
  }

  if (word.startsWith(CONSTRUCT_TRIGGER)) {
    const options = DEPENDENCY_CONSTRUCTS.filter((c) => c.token.startsWith(word));
    if (options.length > 0) return { kind: "construct", start, end, options };
  }
  return null;
}

/** Подставляет выбранную конструкцию вместо набранного префикса. */
export function applyConstruct(text, context, construct) {
  return {
    text: text.slice(0, context.start) + construct.token + text.slice(context.end),
    caret: context.start + construct.token.length,
  };
}

/** Удаляет конструкцию вместе с введённым для неё словом; остальное - без изменений. */
export function removeFilterText(text, context) {
  return { text: text.slice(0, context.start) + text.slice(context.end), caret: context.start };
}
