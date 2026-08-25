/**
 * Importa el distributivo de recintos electorales del CNE (CSV nacional) y lo
 * carga en Supabase, filtrado al cantón Salcedo (Cotopaxi). Genera las mesas
 * (num_junr por recinto -> filas secuenciales) y siembra las 8 contiendas base.
 *
 * Idempotente: usa upsert por las columnas únicas de cada tabla, así que se
 * puede volver a correr sin duplicar datos si el CSV se actualiza.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm import:recintos
 */
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSV_PATH = process.env.RECINTOS_CSV_PATH ?? path.join(__dirname, "../data/recintos-cne-nacional.csv");
const CANTON_OBJETIVO = "SALCEDO";
const PROVINCIA_OBJETIVO = "COTOPAXI";
// Patrón estándar CNE: la parroquia urbana de un cantón comparte cabecera cantonal.
// Para Salcedo eso corresponde a "SAN MIGUEL DE SALCEDO". Si este script se
// reusa para otro cantón, ajustar (o derivar) este valor.
const PARROQUIA_URBANA = "SAN MIGUEL DE SALCEDO";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno. " +
      "Se necesita la service role key (no la anon key) porque el import inserta " +
      "datos de referencia protegidos por RLS."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type CsvRow = Record<string, string>;

function leerFilasCsv(): CsvRow[] {
  const raw = readFileSync(CSV_PATH, "utf-8");
  const lineas = raw.split("\n");
  const idxHeader = lineas.findIndex((l) => l.startsWith("CODIGO PROVINCIA"));
  if (idxHeader === -1) {
    throw new Error("No se encontró la fila de encabezado 'CODIGO PROVINCIA' en el CSV.");
  }
  const csvUtil = lineas.slice(idxHeader).join("\n");
  const filas: CsvRow[] = parse(csvUtil, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return filas.filter((f) => f["CODIGO PROVINCIA"]?.trim());
}

function num(v: string | undefined): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  console.log(`Leyendo CSV: ${CSV_PATH}`);
  const filas = leerFilasCsv();
  const salcedo = filas.filter(
    (f) => f["NOMBRE CANTON"]?.trim() === CANTON_OBJETIVO && f["NOMBRE PROVINCIA"]?.trim() === PROVINCIA_OBJETIVO
  );
  console.log(`Filas totales en el CSV: ${filas.length}. Recintos en ${CANTON_OBJETIVO}: ${salcedo.length}`);

  if (salcedo.length === 0) {
    throw new Error(`No se encontraron filas para el cantón ${CANTON_OBJETIVO}. Revisar el CSV.`);
  }

  // --- provincia ---
  const provinciaRow = salcedo[0]!;
  const { data: provincia, error: errProvincia } = await supabase
    .from("provincias")
    .upsert(
      { codigo_dpa: provinciaRow["CODIGO PROVINCIA"]!.trim(), nombre: provinciaRow["NOMBRE PROVINCIA"]!.trim() },
      { onConflict: "codigo_dpa" }
    )
    .select()
    .single();
  if (errProvincia) throw errProvincia;

  // --- canton ---
  const { data: canton, error: errCanton } = await supabase
    .from("cantones")
    .upsert(
      {
        provincia_id: provincia.id,
        codigo_dpa: provinciaRow["CODIGO CANTON"]!.trim(),
        nombre: provinciaRow["NOMBRE CANTON"]!.trim(),
      },
      { onConflict: "codigo_dpa" }
    )
    .select()
    .single();
  if (errCanton) throw errCanton;

  // --- parroquias ---
  const parroquiasPorCodigo = new Map<string, string>(); // codigo -> nombre
  for (const f of salcedo) {
    parroquiasPorCodigo.set(f["CODIGO PARROQUIA"]!.trim(), f["NOMBRE PARROQUIA"]!.trim());
  }
  const parroquiaIdPorCodigo = new Map<string, string>();
  for (const [codigo, nombre] of parroquiasPorCodigo) {
    const { data: parroquia, error } = await supabase
      .from("parroquias")
      .upsert(
        { canton_id: canton.id, codigo_dpa: codigo, nombre, es_urbana: nombre === PARROQUIA_URBANA },
        { onConflict: "codigo_dpa" }
      )
      .select()
      .single();
    if (error) throw error;
    parroquiaIdPorCodigo.set(codigo, parroquia.id);
  }
  console.log(`Parroquias sembradas: ${parroquiaIdPorCodigo.size}`);

  // --- zonas (opcionales, codigo_zona=0/nombre vacío => sin zona) ---
  const zonaIdPorClave = new Map<string, string>(); // `${parroquiaCodigo}:${zonaCodigo}` -> id
  for (const f of salcedo) {
    const codigoZona = num(f["CODIGO ZONA"]);
    const nombreZona = f["NOMBRE ZONA"]?.trim();
    if (!codigoZona || !nombreZona) continue;
    const parroquiaId = parroquiaIdPorCodigo.get(f["CODIGO PARROQUIA"]!.trim())!;
    const clave = `${f["CODIGO PARROQUIA"]!.trim()}:${codigoZona}`;
    if (zonaIdPorClave.has(clave)) continue;
    const { data: zona, error } = await supabase
      .from("zonas")
      .upsert({ parroquia_id: parroquiaId, codigo_zona: codigoZona, nombre: nombreZona }, { onConflict: "parroquia_id,codigo_zona" })
      .select()
      .single();
    if (error) throw error;
    zonaIdPorClave.set(clave, zona.id);
  }

  // --- recintos + mesas ---
  let totalMesas = 0;
  for (const f of salcedo) {
    const parroquiaId = parroquiaIdPorCodigo.get(f["CODIGO PARROQUIA"]!.trim())!;
    const codigoZona = num(f["CODIGO ZONA"]);
    const claveZona = `${f["CODIGO PARROQUIA"]!.trim()}:${codigoZona}`;
    const zonaId = zonaIdPorClave.get(claveZona) ?? null;

    const { data: recinto, error: errRecinto } = await supabase
      .from("recintos")
      .upsert(
        {
          parroquia_id: parroquiaId,
          zona_id: zonaId,
          codigo_recinto: f["CODIGO RECINTO"]!.trim(),
          nombre: f["NOMBRE RECINTO"]!.trim(),
          cda: f["CDA"]?.trim().toUpperCase() === "SI",
          direccion: f["DIRECCION RECINTO"]?.trim() || null,
          telefono: f["TELEFONO"]?.trim() || null,
          jun_fem: num(f["JUN FEM"]),
          jun_mas: num(f["JUN MAS"]),
          num_junr: num(f["NUM JUNR"]),
          numero_electores: num(f["NUMERO ELECTORES"]),
          x: f["X"]?.trim() ? Number(f["X"]) : null,
          y: f["Y"]?.trim() ? Number(f["Y"]) : null,
          longitud: f["long"]?.trim() ? Number(f["long"]) : null,
          latitud: f["lat"]?.trim() ? Number(f["lat"]) : null,
          dificil_acceso: f["DIFICIL ACCESO"]?.trim().toUpperCase() === "SI",
          sin_conectividad: f["SIN CONECTIVIDAD"]?.trim().toUpperCase() === "SI",
        },
        { onConflict: "codigo_recinto" }
      )
      .select()
      .single();
    if (errRecinto) throw errRecinto;

    const numMesas = num(f["NUM JUNR"]);
    for (let numeroMesa = 1; numeroMesa <= numMesas; numeroMesa++) {
      const { error: errMesa } = await supabase
        .from("mesas")
        .upsert({ recinto_id: recinto.id, numero_mesa: numeroMesa }, { onConflict: "recinto_id,numero_mesa" });
      if (errMesa) throw errMesa;
    }
    totalMesas += numMesas;
  }
  console.log(`Recintos sembrados: ${salcedo.length}. Mesas generadas: ${totalMesas}`);

  // --- contiendas base ---
  // Alcance cantonal/provincial (parroquia_id null): upsert por el índice parcial
  // uq_contests_tipo_sin_parroquia, ya que NULL <> NULL invalida un onConflict
  // compuesto normal.
  const contiendasCantonales = [
    { tipo: "PREFECTURA", nombre: "Prefectura", activo: false },
    { tipo: "ALCALDE", nombre: "Alcaldía de Salcedo", activo: true },
    { tipo: "CONCEJAL_URBANO", nombre: "Concejal Urbano", activo: true },
    { tipo: "CONCEJAL_RURAL", nombre: "Concejal Rural", activo: true },
  ];
  for (const c of contiendasCantonales) {
    // No se puede usar upsert(onConflict: "tipo") porque el índice único que lo
    // respalda es parcial (where parroquia_id is null) y PostgREST no soporta
    // apuntar a índices parciales en ON CONFLICT -- se resuelve con select+insert/update.
    const { data: existente, error: errSelect } = await supabase
      .from("contests")
      .select("id")
      .eq("tipo", c.tipo)
      .is("parroquia_id", null)
      .maybeSingle();
    if (errSelect) throw errSelect;

    if (existente) {
      const { error } = await supabase.from("contests").update(c).eq("id", existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("contests").insert(c);
      if (error) throw error;
    }
  }

  // Junta Parroquial: una fila por cada parroquia rural, upsert por (tipo, parroquia_id).
  const juntasParroquiales = [...parroquiasPorCodigo]
    .filter(([, nombre]) => nombre !== PARROQUIA_URBANA)
    .map(([codigo, nombre]) => ({
      tipo: "JUNTA_PARROQUIAL",
      nombre: `Junta Parroquial - ${nombre}`,
      parroquia_id: parroquiaIdPorCodigo.get(codigo)!,
      activo: nombre === "PANZALEO",
    }));
  for (const c of juntasParroquiales) {
    const { error } = await supabase.from("contests").upsert(c, { onConflict: "tipo,parroquia_id" });
    if (error) throw error;
  }
  console.log(`Contiendas sembradas: ${contiendasCantonales.length + juntasParroquiales.length}`);

  console.log("Import completo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
