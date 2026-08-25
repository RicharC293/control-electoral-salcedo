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
  type MesaOpcion,
  type PerfilAdmin,
  type RecintoOpcion,
} from "../../lib/admin";
import { useToast } from "../../lib/toast";

type Enlace = { url: string; waUrl: string };

// El token crudo del enlace nunca se guarda en la base (solo su hash), así
// que la única forma de que sobreviva a un F5 es guardarlo en este navegador.
// Si el admin abre el panel en otro equipo, tendrá que generar uno nuevo --
// el anterior sigue siendo válido, solo deja de estar a la mano acá.
const claveEnlace = (perfilId: string) => `enlace-acceso:${perfilId}`;

function leerEnlacesGuardados(perfiles: PerfilAdmin[]): Record<string, Enlace> {
  const resultado: Record<string, Enlace> = {};
  for (const p of perfiles) {
    const guardado = localStorage.getItem(claveEnlace(p.id));
    if (!guardado) continue;
    try {
      resultado[p.id] = JSON.parse(guardado) as Enlace;
    } catch {
      // ignorar entradas corruptas
    }
  }
  return resultado;
}

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
  const { mostrarExito, mostrarError } = useToast();
  const [perfiles, setPerfiles] = useState<PerfilAdmin[]>([]);
  const [recintos, setRecintos] = useState<RecintoOpcion[]>([]);
  const [conteoMesas, setConteoMesas] = useState<Record<string, number>>({});
  const [mesas, setMesas] = useState<MesaOpcion[]>([]);
  const [ordenarPor, setOrdenarPor] = useState<"recinto" | "cobertura">("recinto");
  const [filtroRecintoId, setFiltroRecintoId] = useState("");
  const [cargando, setCargando] = useState(true);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rolNuevo, setRolNuevo] = useState<"VEEDOR" | "COORDINADOR">("VEEDOR");
  const [recintoId, setRecintoId] = useState("");
  const [mesaId, setMesaId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [enlaces, setEnlaces] = useState<Record<string, { url: string; waUrl: string }>>({});

  function cargar() {
    setCargando(true);
    Promise.all([listarPerfiles(), listarRecintos(), contarMesasPorRecinto()])
      .then(([p, r, c]) => {
        const veeduria = p.filter((perfil) => perfil.rol === "VEEDOR" || perfil.rol === "COORDINADOR");
        setPerfiles(veeduria);
        setRecintos(r);
        setConteoMesas(c);
        setEnlaces(leerEnlacesGuardados(veeduria));
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
      mostrarExito(rolNuevo === "VEEDOR" ? "Veedor agregado." : "Coordinador agregado.");
    } catch (err) {
      mostrarError(err instanceof Error ? err.message : "No se pudo crear el perfil.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleGenerarEnlace(p: PerfilAdmin) {
    try {
      const enlace = await generarEnlaceAcceso(p, perfilId);
      localStorage.setItem(claveEnlace(p.id), JSON.stringify(enlace));
      setEnlaces((prev) => ({ ...prev, [p.id]: enlace }));
      mostrarExito("Enlace generado.");
    } catch {
      mostrarError("No se pudo generar el enlace.");
    }
  }

  async function handleAscender(p: PerfilAdmin) {
    if (!confirm(`¿Hacer a ${p.nombres} ${p.apellidos} coordinador de todo el recinto? Deja de estar asignado a su mesa.`))
      return;
    try {
      await ascenderACoordinador(p);
      cargar();
      mostrarExito(`${p.nombres} ahora es coordinador del recinto.`);
    } catch (err) {
      mostrarError(err instanceof Error ? err.message : "No se pudo ascender a coordinador.");
    }
  }

  async function handleEliminar(p: PerfilAdmin) {
    if (
      !confirm(
        `¿Eliminar a ${p.nombres} ${p.apellidos}? Esto también elimina cualquier enlace de acceso que se le haya generado. No se puede deshacer.`
      )
    )
      return;
    try {
      await eliminarPerfil(p.id);
      localStorage.removeItem(claveEnlace(p.id));
      cargar();
      mostrarExito("Perfil eliminado.");
    } catch (err) {
      mostrarError(err instanceof Error ? err.message : "No se pudo eliminar.");
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

  const resumenVisible = useMemo(
    () => (filtroRecintoId ? resumenOrdenado.filter((r) => r.recintoId === filtroRecintoId) : resumenOrdenado),
    [resumenOrdenado, filtroRecintoId]
  );

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

        <button disabled={guardando} type="submit">
          {guardando ? "Creando..." : "Agregar"}
        </button>
      </form>

      <div className="veeduria-controles">
        <label className="campo-etiquetado campo-orden">
          <span>Filtrar por recinto</span>
          <select value={filtroRecintoId} onChange={(e) => setFiltroRecintoId(e.target.value)}>
            <option value="">Todos los recintos</option>
            {recintos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        {!filtroRecintoId && (
          <label className="campo-etiquetado campo-orden">
            <span>Ordenar por</span>
            <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value as "recinto" | "cobertura")}>
              <option value="recinto">Recinto (A-Z)</option>
              <option value="cobertura">Cobertura (menos cubiertos primero)</option>
            </select>
          </label>
        )}
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <div className="lista-recintos">
          {resumenVisible.map((r) => (
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
                <table className="tabla-actas tabla-veeduria">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Rol</th>
                      <th>Mesa</th>
                      <th>Contacto</th>
                      <th className="col-activo">Activo</th>
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
                        <td>
                          <span className="contacto-cedula">{p.cedula ?? "-"}</span>
                          <span className="contacto-telefono">{p.telefono ?? "-"}</span>
                        </td>
                        <td className="col-activo">
                          <input
                            type="checkbox"
                            checked={p.activo}
                            onChange={() => actualizarPerfilActivo(p.id, !p.activo).then(cargar)}
                          />
                        </td>
                        <td>
                          <div className="fila-acciones">
                            <div className="grupo-acciones">
                              {enlaces[p.id] ? (
                                <>
                                  <a className="boton-fila boton-fila-whatsapp" href={enlaces[p.id].waUrl} target="_blank" rel="noreferrer">
                                    WhatsApp
                                  </a>
                                  <button
                                    className="boton-fila"
                                    onClick={() => navigator.clipboard.writeText(enlaces[p.id].url)}
                                  >
                                    Copiar
                                  </button>
                                  <button className="boton-fila" onClick={() => handleGenerarEnlace(p)}>
                                    Regenerar
                                  </button>
                                </>
                              ) : (
                                <button className="boton-secundario boton-chico" onClick={() => handleGenerarEnlace(p)}>
                                  Generar enlace
                                </button>
                              )}
                            </div>
                            <div className="grupo-acciones grupo-acciones-perfil">
                              {p.rol === "VEEDOR" && (
                                <button className="boton-fila" onClick={() => handleAscender(p)}>
                                  Ascender
                                </button>
                              )}
                              <button className="boton-fila boton-fila-eliminar" onClick={() => handleEliminar(p)}>
                                Eliminar
                              </button>
                            </div>
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
