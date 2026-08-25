import { formatearMesa } from "@control-electoral/domain";
import { useEffect, useMemo, useState } from "react";
import { AdminNav } from "./AdminNav";
import {
  actualizarPerfilActivo,
  ascenderACoordinador,
  contarMesasPorRecinto,
  crearPerfil,
  eliminarPerfil,
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

const ROL_LABEL: Record<"VEEDOR" | "COORDINADOR", string> = { VEEDOR: "Veedor", COORDINADOR: "Coordinador" };
const SEXO_LABEL: Record<MesaOpcion["sexo"], string> = { F: "Femenina", M: "Masculina" };

type RecintoResumen = {
  recintoId: string;
  nombre: string;
  parroquiaNombre: string;
  totalMesas: number;
  veedoresActivos: number;
  tieneCoordinadorActivo: boolean;
  perfiles: PerfilAdmin[];
};

function construirResumen(
  perfiles: PerfilAdmin[],
  recintos: RecintoOpcion[],
  conteoMesas: Record<string, number>
): RecintoResumen[] {
  const porRecinto = new Map<string, PerfilAdmin[]>();
  for (const p of perfiles) {
    const recintoId = p.rol === "VEEDOR" ? p.mesas?.recinto_id : p.recinto_id;
    if (!recintoId) continue;
    if (!porRecinto.has(recintoId)) porRecinto.set(recintoId, []);
    porRecinto.get(recintoId)!.push(p);
  }
  return recintos.map((r) => {
    const asignados = porRecinto.get(r.id) ?? [];
    const perfilesOrdenados = [...asignados].sort((a, b) => {
      if (a.rol !== b.rol) return a.rol === "COORDINADOR" ? -1 : 1;
      return (a.mesas?.numero_mesa ?? 0) - (b.mesas?.numero_mesa ?? 0);
    });
    return {
      recintoId: r.id,
      nombre: r.nombre,
      parroquiaNombre: r.parroquia_nombre,
      totalMesas: conteoMesas[r.id] ?? 0,
      veedoresActivos: asignados.filter((p) => p.rol === "VEEDOR" && p.activo).length,
      tieneCoordinadorActivo: asignados.some((p) => p.rol === "COORDINADOR" && p.activo),
      perfiles: perfilesOrdenados,
    };
  });
}

export function Veeduria({ rol, perfilId }: Props) {
  const [perfiles, setPerfiles] = useState<PerfilAdmin[]>([]);
  const [recintos, setRecintos] = useState<RecintoOpcion[]>([]);
  const [conteoMesas, setConteoMesas] = useState<Record<string, number>>({});
  const [mesas, setMesas] = useState<MesaOpcion[]>([]);
  const [ordenarPor, setOrdenarPor] = useState<"recinto" | "cobertura">("recinto");
  const [cargando, setCargando] = useState(true);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rolNuevo, setRolNuevo] = useState<"VEEDOR" | "COORDINADOR">("VEEDOR");
  const [recintoId, setRecintoId] = useState("");
  const [mesaId, setMesaId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlaces, setEnlaces] = useState<Record<string, { url: string; waUrl: string }>>({});

  function cargar() {
    setCargando(true);
    Promise.all([listarPerfiles(), listarRecintos(), contarMesasPorRecinto()])
      .then(([p, r, c]) => {
        setPerfiles(p.filter((perfil) => perfil.rol === "VEEDOR" || perfil.rol === "COORDINADOR"));
        setRecintos(r);
        setConteoMesas(c);
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
    try {
      await crearPerfil({
        nombres,
        apellidos,
        telefono,
        cedula,
        rol: rolNuevo,
        recintoId,
        mesaId: rolNuevo === "VEEDOR" ? mesaId : undefined,
      });
      setNombres("");
      setApellidos("");
      setCedula("");
      setTelefono("");
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

  async function handleEliminar(p: PerfilAdmin) {
    if (
      !confirm(
        `¿Eliminar a ${p.nombres} ${p.apellidos}? Esto también elimina cualquier enlace de acceso que se le haya generado. No se puede deshacer.`
      )
    )
      return;
    setError(null);
    try {
      await eliminarPerfil(p.id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  const resumen = useMemo(() => construirResumen(perfiles, recintos, conteoMesas), [perfiles, recintos, conteoMesas]);

  const resumenOrdenado = useMemo(() => {
    const copia = [...resumen];
    if (ordenarPor === "cobertura") {
      copia.sort((a, b) => {
        const covA = a.totalMesas === 0 ? 1 : a.veedoresActivos / a.totalMesas;
        const covB = b.totalMesas === 0 ? 1 : b.veedoresActivos / b.totalMesas;
        return covA - covB;
      });
    } else {
      copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    return copia;
  }, [resumen, ordenarPor]);

  return (
    <div className="contenedor-panel">
      <AdminNav rol={rol} />
      <h1>Veeduría</h1>

      <form className="card formulario-candidato" onSubmit={handleCrear}>
        <h3>Agregar veedor o coordinador</h3>
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
        <div className="fila-formulario">
          <label className="campo-etiquetado">
            <span>Cédula</span>
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} required />
          </label>
          <label className="campo-etiquetado">
            <span>Teléfono (WhatsApp)</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
          </label>
        </div>
        <label className="campo-etiquetado">
          <span>Rol</span>
          <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as "VEEDOR" | "COORDINADOR")}>
            <option value="VEEDOR">Veedor (una mesa)</option>
            <option value="COORDINADOR">Coordinador (todo el recinto)</option>
          </select>
        </label>
        <div className="fila-formulario">
          <label className="campo-etiquetado">
            <span>Recinto</span>
            <select value={recintoId} onChange={(e) => setRecintoId(e.target.value)} required>
              <option value="">Selecciona un recinto</option>
              {recintos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} ({r.parroquia_nombre})
                </option>
              ))}
            </select>
          </label>
          {rolNuevo === "VEEDOR" && (
            <label className="campo-etiquetado">
              <span>Mesa</span>
              <select value={mesaId} onChange={(e) => setMesaId(e.target.value)} required disabled={!recintoId}>
                <option value="">Selecciona una mesa</option>
                {mesas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {formatearMesa(m)} ({SEXO_LABEL[m.sexo]})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <button disabled={guardando} type="submit">
          {guardando ? "Creando..." : "Agregar"}
        </button>
      </form>

      <label className="campo-etiquetado campo-orden">
        <span>Ordenar por</span>
        <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value as "recinto" | "cobertura")}>
          <option value="recinto">Recinto (A-Z)</option>
          <option value="cobertura">Cobertura (menos cubiertos primero)</option>
        </select>
      </label>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <div className="lista-recintos">
          {resumenOrdenado.map((r) => (
            <div key={r.recintoId} className="recinto-grupo card">
              <div className="recinto-encabezado">
                <div>
                  <strong>{r.nombre}</strong>
                  <span className="recinto-parroquia">{r.parroquiaNombre}</span>
                </div>
                <div className="recinto-cobertura">
                  <span className={`badge-cobertura ${r.veedoresActivos >= r.totalMesas && r.totalMesas > 0 ? "badge-completo" : ""}`}>
                    {r.veedoresActivos}/{r.totalMesas} mesas
                  </span>
                  <span className={`badge-coordinador ${r.tieneCoordinadorActivo ? "badge-si" : "badge-no"}`}>
                    {r.tieneCoordinadorActivo ? "Con coordinador" : "Sin coordinador"}
                  </span>
                </div>
              </div>
              <div className="barra-cobertura">
                <div
                  className="barra-cobertura-relleno"
                  style={{ width: `${r.totalMesas ? Math.min(100, (r.veedoresActivos / r.totalMesas) * 100) : 0}%` }}
                />
              </div>

              {r.perfiles.length === 0 ? (
                <p className="nota-bloqueo">Todavía no hay veedores ni coordinador asignado en este recinto.</p>
              ) : (
                <table className="tabla-actas">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Rol</th>
                      <th>Mesa</th>
                      <th>Cédula</th>
                      <th>Teléfono</th>
                      <th>Activo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.perfiles.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.nombres} {p.apellidos}
                        </td>
                        <td>{ROL_LABEL[p.rol as "VEEDOR" | "COORDINADOR"]}</td>
                        <td>{p.rol === "VEEDOR" && p.mesas ? formatearMesa(p.mesas) : "Todo el recinto"}</td>
                        <td>{p.cedula ?? "-"}</td>
                        <td>{p.telefono ?? "-"}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={p.activo}
                            onChange={() => actualizarPerfilActivo(p.id, !p.activo).then(cargar)}
                          />
                        </td>
                        <td>
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
                            <button
                              className="boton-secundario boton-chico boton-eliminar"
                              onClick={() => handleEliminar(p)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
