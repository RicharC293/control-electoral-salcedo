import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import { actualizarPerfilActivo, crearPerfil, eliminarPerfil, listarPerfiles, type PerfilAdmin } from "../../lib/admin";
import { useToast } from "../../lib/toast";

type Props = { rol: "ADMIN" | "AUDITOR"; perfilId: string };

const ROL_LABEL: Record<"AUDITOR" | "ADMIN", string> = { AUDITOR: "Auditor", ADMIN: "Admin" };

export function Usuarios({ rol, perfilId }: Props) {
  const { mostrarExito, mostrarError } = useToast();
  const [perfiles, setPerfiles] = useState<PerfilAdmin[]>([]);
  const [cargando, setCargando] = useState(true);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [rolNuevo, setRolNuevo] = useState<"AUDITOR" | "ADMIN">("AUDITOR");
  const [email, setEmail] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [avisoPassword, setAvisoPassword] = useState<{ email: string; password: string } | null>(null);

  function cargar() {
    setCargando(true);
    listarPerfiles()
      .then((p) => setPerfiles(p.filter((perfil) => perfil.rol === "AUDITOR" || perfil.rol === "ADMIN")))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setAvisoPassword(null);
    try {
      const { tempPassword } = await crearPerfil({ nombres, apellidos, rol: rolNuevo, email });
      if (tempPassword) setAvisoPassword({ email, password: tempPassword });
      setNombres("");
      setApellidos("");
      setEmail("");
      cargar();
    } catch (err) {
      mostrarError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar(p: PerfilAdmin) {
    if (p.id === perfilId) {
      mostrarError("No puedes eliminar tu propia cuenta.");
      return;
    }
    if (!confirm(`¿Eliminar a ${p.nombres} ${p.apellidos}? No se puede deshacer.`)) return;
    try {
      await eliminarPerfil(p.id);
      cargar();
      mostrarExito("Usuario eliminado.");
    } catch (err) {
      mostrarError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Usuarios</h1>

      <form className="card formulario-candidato" onSubmit={handleCrear}>
        <h3>Agregar usuario</h3>
        <div className="fila-formulario">
          <label className="campo-etiquetado">
            <span>Nombres</span>
            <input value={nombres} onChange={(e) => setNombres(e.target.value)} required />
          </label>
          <label className="campo-etiquetado">
            <span>Apellidos</span>
            <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
          </label>
        </div>
        <label className="campo-etiquetado">
          <span>Rol</span>
          <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as "AUDITOR" | "ADMIN")}>
            <option value="AUDITOR">Auditor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <label className="campo-etiquetado">
          <span>Correo real</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        {avisoPassword && (
          <p className="aviso-password">
            Cuenta creada: <strong>{avisoPassword.email}</strong> / contraseña temporal:{" "}
            <strong>{avisoPassword.password}</strong> — cópiala ahora, no se vuelve a mostrar.
          </p>
        )}

        <button disabled={guardando} type="submit">
          {guardando ? "Creando..." : "Agregar usuario"}
        </button>
      </form>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table className="tabla-actas">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Correo</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.nombres} {p.apellidos}
                </td>
                <td>{ROL_LABEL[p.rol as "AUDITOR" | "ADMIN"]}</td>
                <td>{p.email ?? "-"}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={p.activo}
                    onChange={() => actualizarPerfilActivo(p.id, !p.activo).then(cargar)}
                  />
                </td>
                <td>
                  <button className="boton-secundario boton-chico boton-eliminar" onClick={() => handleEliminar(p)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {perfiles.length === 0 && (
              <tr>
                <td colSpan={5}>Todavía no hay usuarios.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
