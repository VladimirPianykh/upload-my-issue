import { createContext, useContext, useEffect, useState } from "react";

/**
 * Additional shortcuts.md: "Сочетания не обрабатываются при открытом
 * внутреннем диалоге приложения." Приложение может показывать несколько
 * независимых видов диалогов одновременно (промис-диалоги DialogProvider,
 * RepoDialog, SettingsDialog), поэтому здесь просто считаем, сколько из
 * них сейчас открыто - shortcut'ы блокируются, пока это число больше нуля.
 */
const DialogOpenContext = createContext(null);

export function DialogOpenProvider({ children }) {
  const [openCount, setOpenCount] = useState(0);
  return (
    <DialogOpenContext.Provider value={{ openCount, setOpenCount }}>
      {children}
    </DialogOpenContext.Provider>
  );
}

function useDialogOpenContext() {
  const ctx = useContext(DialogOpenContext);
  if (!ctx) throw new Error("Must be used within a DialogOpenProvider");
  return ctx;
}

/** true, если открыт хотя бы один внутренний диалог приложения. */
export function useAnyDialogOpen() {
  return useDialogOpenContext().openCount > 0;
}

/**
 * Регистрирует текущий диалог как открытый/закрытый. Вызывается компонентом
 * диалога с его собственным состоянием видимости (`isOpen`).
 */
export function useRegisterDialogOpen(isOpen) {
  const { setOpenCount } = useDialogOpenContext();
  useEffect(() => {
    if (!isOpen) return;
    setOpenCount((c) => c + 1);
    return () => setOpenCount((c) => c - 1);
  }, [isOpen, setOpenCount]);
}
