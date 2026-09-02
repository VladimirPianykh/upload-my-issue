import { createContext, useCallback, useContext, useRef, useState } from "react";

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const ask = useCallback((config) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog(config);
    });
  }, []);

  const choose = (value) => {
    setDialog(null);
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  };

  return (
    <DialogContext.Provider value={ask}>
      {children}
      {dialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{dialog.title}</h3>
            {dialog.message && <p className="modal-message">{dialog.message}</p>}
            {dialog.checkbox && (
              <label className="modal-checkbox">
                <input
                  type="checkbox"
                  onChange={(e) => (dialog._applyToAll = e.target.checked)}
                />
                {dialog.checkbox}
              </label>
            )}
            <div className="modal-actions">
              {dialog.options.map((opt) => (
                <button
                  key={opt.value}
                  className={opt.danger ? "btn btn-danger" : "btn"}
                  onClick={() => choose({ value: opt.value, applyToAll: !!dialog._applyToAll })}
                  autoFocus={opt.primary}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ask = useContext(DialogContext);
  if (!ask) throw new Error("useDialog must be used within DialogProvider");
  return ask;
}
