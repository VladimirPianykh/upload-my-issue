import { useEffect, useState } from "react";
import { api } from "./api";

const AUTOCOMPLETE_DEBOUNCE_MS = 250;
const IDLE = { status: "idle", items: [], error: null };
const LOADING = { status: "loading", items: [], error: null };

/**
 * Карточки автодополнения issue для текста `query` (null - автодополнение
 * закрыто, ничего не запрашивается).
 *
 * Возвращает { status: "idle" | "loading" | "ready" | "error", items, error }.
 * Запрос откладывается (debounce); ответ на устаревший запрос отбрасывается, а
 * пока для текущего `query` ответа нет, статус - "loading".
 */
export function useIssueSuggestions(query) {
  const [found, setFound] = useState({ query: null, items: [], error: null });

  useEffect(() => {
    if (query === null) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const items = await api.searchIssuesForDependencyFilter(query);
        if (!cancelled) setFound({ query, items, error: null });
      } catch (err) {
        if (!cancelled) setFound({ query, items: [], error: err?.message || String(err) });
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (query === null) return IDLE;
  if (found.query !== query) return LOADING;
  return { status: found.error ? "error" : "ready", items: found.items, error: found.error };
}
