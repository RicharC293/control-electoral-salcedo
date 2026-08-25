import { formatearMesa } from "@control-electoral/domain";
import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import {
  actualizarPerfilActivo,
  ascenderACoordinador,
  crearPerfil,
  generarEnlaceAcceso,
  listarMesasDeRecinto,
  listarPerfiles,
  listarRecintos,
  revocarTokensDePerfil,
  type MesaOpcion,
  type PerfilAdmin,
  type RecintoOpcion,
} from "../../lib/admin";
type Props = { rol: "ADMIN" | "AUDITOR"; perfilId: string };

const ROL_LABEL: Record<PerfilAdmin["rol"], string> = {
  VEEDOR: "Veedor",
  COORDINADOR: "Coordinador",
  AUDITOR: "Auditor",
  ADMIN: "Admin",
};

const SEXO_LABEL: Record<MesaOpcion["sexo"], string> = { F: "Femenina", M: "Masculina" };

function ubicacionDe(p: PerfilAdmin): string {
  if (p.rol === "VEEDOR" && p.mesas) {
    return `${p.mesas.recintos.nombre} · ${formatearMesa(p.mesas)}`;
  }
  if (p.rol === "COORDINADOR" && p.recintos) {
    return `${p.recintos.nombre} (todo el recinto)`;
  }
  return "-";
}

export function Perfiles({ rol, perfilId }: Props) {
  const [perfiles, setPerfiles] = useState<PerfilAdmin[]>([]);
  const [recintos, setRecintos] = useState<RecintoOpcion[]>([]);
  const [mesas, setMesas] = useState<MesaOpcion[]>([]);
  const [filtro, setFiltro] = useState<PerfilAdmin["rol"] | "TODOS">("VEEDOR");
  const [cargando, setCargando] = useState(true);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rolNuevo, setRolNuevo] = useState<PerfilAdmin["rol"]>("VEEDOR");
  const [recintoId, setRecintoId] = useState("");
  const [mesaId, setMesaId] = useState("");
  const [email, setEmail] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoPassword, setAvisoPassword] = useState<{ email: string; password: string } | null>(null);
  const [enlaces, setEnlaces] = useState<Record<string, { url: string; waUrl: string }>>({});

  const requiereCedula = rolNuevo === "VEEDOR" || rolNuevo === "COORDINADOR";

  function cargar() {
    setCargando(true);
    Promise.all([listarPerfiles(), listarRecintos()])
      .then(([p, r]) => {
        setPerfiles(p);
        setRecintos(r);
      })
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    if (!recintoId) {
      setMesas([]);
      return;
    }
    listarMesasDeRecinto(recintoId).then(setMesas);
  }, [recintoId]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAvisoPassword(null);
    try {
      const { tempPassword } = await crearPerfil({
        nombres,
        apellidos,
        telefono: telefono || undefined,
        cedula: requiereCedula ? cedula : undefined,
        rol: rolNuevo,
        recintoId: rolNuevo === "COORDINADOR" ? recintoId : undefined,
        mesaId: rolNuevo === "VEEDOR" ? mesaId : undefined,
        email: rolNuevo === "AUDITOR" || rolNuevo === "ADMIN" ? email : undefined,
      });
      if (tempPassword) setAvisoPassword({ email, password: tempPassword });
      setNombres("");
      setApellidos("");
      setCedula("");
      setTelefono("");
      setEmail("");
      setRecintoId("");
      setMesaId("");
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el perfil.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleGenerarEnlace(p: PerfilAdmin) {
    try {
      const enlace = await generarEnlaceAcceso(p, perfilId);
      setEnlaces((prev) => ({ ...prev, [p.id]: enlace }));
    } catch {
      setError("No se pudo generar el enlace.");
    }
  }

  async function handleAscender(p: PerfilAdmin) {
    if (!confirm(`¿Hacer a ${p.nombres} ${p.apellidos} coordinador de todo el recinto? Deja de estar asignado a su mesa.`))
      return;
    setError(null);
    try {
      await ascenderACoordinador(p);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ascender a coordinador.");
    }
  }

  const perfilesFiltrados = perfiles.filter((p) => filtro === "TODOS" || p.rol === filtro);

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Perfiles</h1>

      <form className="card formulario-candidato" onSubmit={handleCrear}>
        <h3>Crear perfil</h3>
        <div className="fila-formulario">
          <input placeholder="Nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required />
          <input placeholder="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
        </div>
        <div className="fila-formulario">
          <input
            placeholder="Cédula"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            required={requiereCedula}
            disabled={!requiereCedula}
          />
          <input
            placeholder="Teléfono (WhatsApp)"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            required={requiereCedula}
          />
        </div>
        <div className="fila-formulario">
          <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as PerfilAdmin["rol"])}>
            <option value="VEEDOR">Veedor</option>
            <option value="COORDINADOR">Coordinador</option>
            <option value="AUDITOR">Auditor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        {(rolNuevo === "VEEDOR" || rolNuevo === "COORDINADOR") && (
          <div className="fila-formulario">
            <select value={recintoId} onChange={(e) => setRecintoId(e.target.value)} required>
              <option value="">Selecciona un recinto</option>
              {recintos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} ({r.parroquia_nombre})
                </option>
              ))}
            </select>
            {rolNuevo === "VEEDOR" && (
              <select value={mesaId} onChange={(e) => setMesaId(e.target.value)} required disabled={!recintoId}>
                <option value="">Selecciona una mesa</option>
                {mesas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {formatearMesa(m)} ({SEXO_LABEL[m.sexo]})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {(rolNuevo === "AUDITOR" || rolNuevo === "ADMIN") && (
          <input
            type="email"
            placeholder="Correo real"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}

        {error && <p className="error">{error}</p>}
        {avisoPassword && (
          <p className="aviso-password">
            Cuenta creada: <strong>{avisoPassword.email}</strong> / contraseña temporal: <strong>{avisoPassword.password}</strong>{" "}
            — cópiala ahora, no se vuelve a mostrar.
          </p>
        )}

        <button disabled={guardando} type="submit">
          {guardando ? "Creando..." : "Crear perfil"}
        </button>
      </form>

      <div className="selector-contiendas">
        {(["VEEDOR", "COORDINADOR", "AUDITOR", "ADMIN", "TODOS"] as const).map((r) => (
          <button
            key={r}
            className={`chip-contienda ${filtro === r ? "chip-activa" : ""}`}
            onClick={() => setFiltro(r)}
          >
            {r === "TODOS" ? "Todos" : ROL_LABEL[r]}
          </button>
        ))}
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table className="tabla-actas">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Ubicación</th>
              <th>Cédula</th>
              <th>Contacto</th>
              <th>Activo</th>
              <th>Enlace</th>
            </tr>
          </thead>
          <tbody>
            {perfilesFiltrados.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.nombres} {p.apellidos}
                </td>
                <td>{ROL_LABEL[p.rol]}</td>
                <td>{ubicacionDe(p)}</td>
                <td>{p.cedula ?? "-"}</td>
                <td>{p.telefono ?? p.email ?? "-"}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={p.activo}
                    onChange={() => actualizarPerfilActivo(p.id, !p.activo).then(cargar)}
                  />
                </td>
                <td>
                  {(p.rol === "VEEDOR" || p.rol === "COORDINADOR") && (
                    <div className="acciones-enlace">
                      <button className="boton-secundario boton-chico" onClick={() => handleGenerarEnlace(p)}>
                        Generar enlace
                      </button>
                      {enlaces[p.id] && (
                        <>
                          <a href={enlaces[p.id].waUrl} target="_blank" rel="noreferrer">
                            Enviar por WhatsApp
                          </a>
                          <button
                            className="boton-secundario boton-chico"
                            onClick={() => navigator.clipboard.writeText(enlaces[p.id].url)}
                          >
                            Copiar enlace
                          </button>
                        </>
                      )}
                      <button className="boton-secundario boton-chico" onClick={() => revocarTokensDePerfil(p.id)}>
                        Revocar enlaces
                      </button>
                      {p.rol === "VEEDOR" && (
                        <button className="boton-secundario boton-chico" onClick={() => handleAscender(p)}>
                          Ascender a coordinador
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
