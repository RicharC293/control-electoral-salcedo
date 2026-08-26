import { useEffect, useRef, useState } from "react";
import type { FotoPendiente } from "../lib/db";
import type { ActaFotoRow } from "../lib/queries";
import { comprimirFoto, obtenerUrlFirmadaFoto } from "../lib/queries";
import { encolarFoto } from "../lib/sync";
import { useToast } from "../lib/toast";

type Props = {
  actaId: string;
  perfilId: string;
  fotos: ActaFotoRow[];
  fotoPendiente: FotoPendiente | null;
  onSubida: () => void;
};

const SYNC_LABEL: Record<string, string> = {
  PENDING: "Guardado localmente, pendiente de enviar",
  SYNCING: "Enviando...",
  ERROR: "No se pudo enviar",
};

export function PhotoUpload({ actaId, perfilId, fotos, fotoPendiente, onSubida }: Props) {
  const { mostrarError } = useToast();
  const [comprimiendo, setComprimiendo] = useState(false);
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const ultimaFoto = fotos[0];
  const mimeActual = fotoPendiente?.mimeType ?? ultimaFoto?.mime_type ?? null;
  const esPdf = mimeActual === "application/pdf";

  useEffect(() => {
    if (fotoPendiente) {
      const url = URL.createObjectURL(fotoPendiente.blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (!ultimaFoto) {
      setPreviewUrl(null);
      return;
    }
    obtenerUrlFirmadaFoto(ultimaFoto.storage_path)
      .then(setPreviewUrl)
      .catch(() => setPreviewUrl(null));
  }, [ultimaFoto, fotoPendiente]);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    const input = e.target;
    if (!archivo) return;
    setMostrarOpciones(false);
    setComprimiendo(true);
    try {
      const comprimido = await comprimirFoto(archivo);
      await encolarFoto({ actaId, blob: comprimido, mimeType: archivo.type, uploadedBy: perfilId });
      onSubida();
    } catch {
      mostrarError("No se pudo procesar el archivo. Intenta de nuevo.");
    } finally {
      setComprimiendo(false);
      input.value = "";
    }
  }

  const hayFoto = !!ultimaFoto || !!fotoPendiente;

  return (
    <div className="foto-acta">
      {previewUrl && !esPdf && <img src={previewUrl} alt="Foto del acta" className="foto-acta-preview" />}
      {previewUrl && esPdf && (
        <a href={previewUrl} target="_blank" rel="noreferrer" className="foto-acta-pdf">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
            <path d="M15 2v5h5" strokeLinejoin="round" />
          </svg>
          Ver PDF subido
        </a>
      )}

      {fotoPendiente && (
        <p className={`estado estado-sync-${fotoPendiente.syncStatus.toLowerCase()}`}>
          {SYNC_LABEL[fotoPendiente.syncStatus] ?? fotoPendiente.syncStatus}
        </p>
      )}

      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleArchivo}
        style={{ display: "none" }}
      />
      <input ref={galeriaRef} type="file" accept="image/*" onChange={handleArchivo} style={{ display: "none" }} />
      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf"
        onChange={handleArchivo}
        style={{ display: "none" }}
      />

      <button type="button" className="boton-foto" disabled={comprimiendo} onClick={() => setMostrarOpciones(true)}>
        {comprimiendo ? "Procesando..." : hayFoto ? "Reemplazar foto o PDF" : "Subir foto o PDF del acta"}
      </button>

      {mostrarOpciones && (
        <div className="modal-fondo" onClick={() => setMostrarOpciones(false)}>
          <div className="modal-tarjeta" onClick={(e) => e.stopPropagation()}>
            <h3>¿Cómo quieres subir el acta?</h3>
            <div className="opciones-foto">
              <button type="button" className="opcion-foto" onClick={() => camaraRef.current?.click()}>
                Usar la cámara
              </button>
              <button type="button" className="opcion-foto" onClick={() => galeriaRef.current?.click()}>
                Seleccionar de la galería
              </button>
              <button type="button" className="opcion-foto" onClick={() => pdfRef.current?.click()}>
                Subir un PDF
              </button>
            </div>
            <button type="button" className="boton-secundario" onClick={() => setMostrarOpciones(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
