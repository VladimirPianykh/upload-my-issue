/**
 * Выпадающий список автодополнения (Dependency filter.md, разделы 2 и 4):
 * либо конструкции фильтрации (kind "construct"), либо карточки issue
 * (kind "issue"). Компонент только отображает - выбор, подсветку и
 * клавиатуру ведёт DependencySearchBox.
 */
function Option({ active, onPick, children }) {
  return (
    <div
      role="option"
      aria-selected={active}
      className={`dep-option${active ? " active" : ""}`}
      onClick={onPick}
    >
      {children}
    </div>
  );
}

function ConstructOption({ construct, ...option }) {
  return (
    <Option {...option}>
      <code>{construct.token}</code> <span className="dep-dim">{construct.label}</span>
    </Option>
  );
}

function IssueOption({ issue, ...option }) {
  return (
    <Option {...option}>
      <span className="dep-option-title">#{issue.number} {issue.title}</span>
      <span className={`state-pill ${issue.state}`}>{issue.state}</span>
      <span className="dep-dim">Зависимости: {issue.dependencies_count}</span>
      <span className="dep-dim">Зависимые: {issue.dependents_count}</span>
    </Option>
  );
}

function issueListMessage({ status, items, error }) {
  if (status === "loading") return { text: "Загрузка..." };
  if (status === "error") return { text: error, isError: true };
  if (items.length === 0) return { text: "Issues не найдены" };
  return null;
}

export default function AutocompletePopup({ kind, entries, suggestions, active, onPick }) {
  const message = kind === "issue" ? issueListMessage(suggestions) : null;
  return (
    <div
      className="dep-popup"
      role="listbox"
      aria-label="Автодополнение"
      onMouseDown={(e) => e.preventDefault()} // клик по списку не должен уводить фокус из поля
    >
      {message && <div className={`dep-message${message.isError ? " dep-error" : ""}`}>{message.text}</div>}
      {entries.map((entry, i) => {
        const option = { active: i === active, onPick: () => onPick(entry) };
        return kind === "construct" ? (
          <ConstructOption key={entry.token} construct={entry} {...option} />
        ) : (
          <IssueOption key={entry.number} issue={entry} {...option} />
        );
      })}
    </div>
  );
}
