import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { verificarTokenYCrearSesion } from "../lib/session";

export function TokenGate() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    verificarTokenYCrearSesion(token)
      .then(() => navigate("/", { replace: true }))
      .catch((e) => setError(e instanceof Error ? e.message : "Enlace inválido."));
  }, [token, navigate]);

  if (error) {
    return (
      <div className="pantalla-centrada">
        <h2>No pudimos validar tu enlace</h2>
        <p>{error}</p>
        <p>Pide al coordinador que te reenvíe un enlace nuevo.</p>
      </div>
    );
  }

  return (
    <div className="pantalla-centrada">
      <p>Validando tu acceso...</p>
    </div>
  );
}
