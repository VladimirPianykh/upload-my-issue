/**
 * Dependency filter.md, раздел 3: выбранные фильтры зависимостей на панели
 * фильтрации. Блок неизменяем - единственное действие - удаление крестиком;
 * чтобы изменить issue или режим, фильтр удаляют и создают новый.
 */
export default function DependencyFilterChips({ filters, onRemove }) {
  if (filters.length === 0) return null;
  return (
    <ul className="dep-chips" aria-label="Фильтры зависимостей">
      {filters.map((f) => (
        <li key={`${f.mode}:${f.number}`} className="dep-chip">
          <span className="dep-chip-mode">{f.label}</span>
          <span>#{f.number} {f.title}</span>
          <button
            type="button"
            className="dep-chip-remove"
            aria-label={`Удалить фильтр ${f.label} #${f.number}`}
            onClick={() => onRemove(f)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
