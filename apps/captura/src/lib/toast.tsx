import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastTipo = "exito" | "error";
type ToastItem = { id: number; tipo: ToastTipo; mensaje: string };

type ToastContextValue = {
  mostrarExito: (mensaje: string) => void;
  mostrarError: (mensaje: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURACION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const quitar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo: ToastTipo, mensaje: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, tipo, mensaje }]);
      setTimeout(() => quitar(id), DURACION_MS);
    },
    [quitar]
  );

  const mostrarExito = useCallback((mensaje: string) => mostrar("exito", mensaje), [mostrar]);
  const mostrarError = useCallback((mensaje: string) => mostrar("error", mensaje), [mostrar]);

  return (
    <ToastContext.Provider value={{ mostrarExito, mostrarError }}>
      {children}
      <div className="toast-contenedor" role="region" aria-label="Notificaciones">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.tipo}`}
            role="status"
            aria-live="polite"
            onClick={() => quitar(t.id)}
          >
            {t.mensaje}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>.");
  return ctx;
}
