import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../api";
import { applyConstruct, getAutocompleteContext, removeFilterText } from "../dependencySearch";

const AUTOCOMPLETE_DEBOUNCE_MS = 250;

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
  const [found, setFound] = useState({ query: null, items: [], error: null });

  const context = dismissed ? null : getAutocompleteContext(value, Math.min(caret, value.length));
  const issueQuery = context?.kind === "issue" ? context.query : null;

  useEffect(() => {
    if (issueQuery === null) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const items = await api.searchIssuesForDependencyFilter(issueQuery);
        if (!cancelled) setFound({ query: issueQuery, items, error: null });
      } catch (err) {
        if (!cancelled) setFound({ query: issueQuery, items: [], error: err?.message || String(err) });
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [issueQuery]);

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

  const loaded = issueQuery !== null && found.query === issueQuery;
  const entries =
    context?.kind === "construct" ? context.options : loaded && !found.error ? found.items : [];
  const active = entries.length > 0 ? Math.min(highlight, entries.length - 1) : 0;

  const moveCaret = (position) => {
    pendingCaretRef.current = position;
    setCaret(position);
    setDismissed(false);
    setHighlight(0);
  };

  const pick = (entry) => {
    if (context.kind === "construct") {
      const next = applyConstruct(value, context, entry);
      moveCaret(next.caret);
      onChange(next.text);
    } else {
      const next = removeFilterText(value, context);
      moveCaret(next.caret);
      onChange(next.text);
      onPickIssue(context.construct, entry);
    }
  };

  const syncCaret = (e) => {
    const position = e.target.selectionStart;
    if (position === caret) return;
    setCaret(position);
    setDismissed(false);
    setHighlight(0);
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
          setCaret(e.target.selectionStart);
          setDismissed(false);
          setHighlight(0);
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
        <div
          className="dep-popup"
          role="listbox"
          aria-label="Автодополнение"
          onMouseDown={(e) => e.preventDefault()} // клик по списку не должен уводить фокус из поля
        >
          {context.kind === "construct" &&
            entries.map((c, i) => (
              <div
                key={c.token}
                role="option"
                aria-selected={i === active}
                className={`dep-option${i === active ? " active" : ""}`}
                onClick={() => pick(c)}
              >
                <code>{c.token}</code> <span className="dep-dim">{c.label}</span>
              </div>
            ))}
          {context.kind === "issue" && !loaded && <div className="dep-message">Загрузка...</div>}
          {context.kind === "issue" && loaded && found.error && (
            <div className="dep-message dep-error">{found.error}</div>
          )}
          {context.kind === "issue" && loaded && !found.error && entries.length === 0 && (
            <div className="dep-message">Issues не найдены</div>
          )}
          {context.kind === "issue" &&
            entries.map((issue, i) => (
              <div
                key={issue.number}
                role="option"
                aria-selected={i === active}
                className={`dep-option${i === active ? " active" : ""}`}
                onClick={() => pick(issue)}
              >
                <span className="dep-option-title">#{issue.number} {issue.title}</span>
                <span className={`state-pill ${issue.state}`}>{issue.state}</span>
                <span className="dep-dim">Зависимости: {issue.dependencies_count}</span>
                <span className="dep-dim">Зависимые: {issue.dependents_count}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
