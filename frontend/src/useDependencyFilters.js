import { useState } from "react";

// Стабильная ссылка: потребители зависят от списка фильтров, новый [] на каждый рендер зациклил бы перезагрузку.
const NO_FILTERS = [];

/** Формат фильтров для api.listIssues; null - фильтров зависимостей нет. */
export function toBackendFilters(filters) {
  return filters.length ? filters.map(({ mode, number }) => ({ mode, number })) : null;
}

/**
 * Выбранные фильтры зависимостей (Dependency filter.md, раздел 3):
 * [{ mode, label, number, title }]. Номера issue относятся к конкретному
 * репозиторию, поэтому фильтры хранятся вместе с ним, а для другого
 * репозитория читаются как пустые. Точный дубликат (тот же режим и issue) не
 * добавляется.
 */
export function useDependencyFilters(currentRepo) {
  const [stored, setStored] = useState({ repo: currentRepo, filters: NO_FILTERS });
  const filters = stored.repo === currentRepo ? stored.filters : NO_FILTERS;

  const add = (construct, issue) => {
    if (filters.some((f) => f.mode === construct.mode && f.number === issue.number)) return;
    const added = { mode: construct.mode, label: construct.label, number: issue.number, title: issue.title };
    setStored({ repo: currentRepo, filters: [...filters, added] });
  };

  const remove = (filter) => {
    setStored({ repo: currentRepo, filters: filters.filter((f) => f !== filter) });
  };

  return { filters, add, remove };
}
