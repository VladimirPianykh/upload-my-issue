import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyConstruct, getAutocompleteContext, removeFilterText } from "../dependencySearch";
import { useIssueSuggestions } from "../useIssueSuggestions";
import AutocompletePopup from "./AutocompletePopup";

/**
 * Поисковая строка Download с автодополнением фильтров зависимостей
 * (Dependency filter.md, разделы 2-4).
 *
 * Что показывать, целиком определяется текстом и позицией каретки
 * (getAutocompleteContext); компонент хранит только позицию каретки и флаг
 * «закрыто пользователем» (Escape / клик вне списка / потеря фокуса), который
 * сбрасывается любым вводом, перемещением каретки и возвратом фокуса.
 */
export default function DependencySearchBox({ value, onChange, onPickIssue, placeholder }) {
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const pendingCaretRef = useRef(null);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(true); // до первого фокуса список закрыт
  const [highlight, setHighlight] = useState(0);

  const context = dismissed ? null : getAutocompleteContext(value, Math.min(caret, value.length));
  const suggestions = useIssueSuggestions(context?.kind === "issue" ? context.query : null);
  const entries = context?.kind === "construct" ? context.options : suggestions.items;
  const active = Math.min(highlight, Math.max(entries.length - 1, 0));

  useEffect(() => {
    const closeOnOutsideClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setDismissed(true);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useLayoutEffect(() => {
    if (pendingCaretRef.current === null) return;
    inputRef.current?.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
    pendingCaretRef.current = null;
  });

  /** Каретка перемещена пользователем или программно: список определяется заново. */
  const reopenAt = (position) => {
    setCaret(position);
    setDismissed(false);
    setHighlight(0);
  };

  const placeCaret = (position) => {
    pendingCaretRef.current = position;
    reopenAt(position);
  };

  const pick = (entry) => {
    if (context.kind === "construct") {
      const next = applyConstruct(value, context, entry);
      placeCaret(next.caret);
      onChange(next.text);
    } else {
      const next = removeFilterText(value, context);
      placeCaret(next.caret);
      onChange(next.text);
      onPickIssue(context.construct, entry);
    }
  };

  const syncCaret = (e) => {
    if (e.target.selectionStart !== caret) reopenAt(e.target.selectionStart);
  };

  const handleKeyDown = (e) => {
    if (!context) return;
    if (e.key === "Escape") {
      // Закрывает только список: глобальный Escape (снятие выделения issues) не срабатывает.
      e.stopPropagation();
      setDismissed(true);
    } else if (entries.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((active + step + entries.length) % entries.length);
    } else if (entries.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      pick(entries[active]);
    }
  };

  return (
    <div className="dep-search" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          reopenAt(e.target.selectionStart);
        }}
        onFocus={(e) => {
          setCaret(e.target.selectionStart);
          setDismissed(false);
        }}
        onBlur={() => setDismissed(true)}
        onSelect={syncCaret}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onKeyDown={handleKeyDown}
      />
      {context && (
        <AutocompletePopup
          kind={context.kind}
          entries={entries}
          suggestions={suggestions}
          active={active}
          onPick={pick}
        />
      )}
    </div>
  );
}
