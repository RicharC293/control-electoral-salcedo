import { useState } from "react";
import { iniciarSesion } from "../lib/auth";
import { useToast } from "../lib/toast";

type Props = { onIngreso: () => void };

export function Login({ onIngreso }: Props) {
  const { mostrarError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await iniciarSesion(email, password);
      onIngreso();
    } catch {
      mostrarError("Correo o contraseña incorrectos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pantalla-login">
      <form className="tarjeta-login" onSubmit={handleSubmit}>
        <h1>Control Electoral Salcedo</h1>
        <p className="subtitulo">Panel de auditoría y administración</p>

        <label>
          Correo
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <button disabled={enviando} type="submit">
          {enviando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
