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
  PENDING: "Foto guardada localmente, pendiente de enviar",
  SYNCING: "Enviando foto...",
  ERROR: "No se pudo enviar la foto",
};

export function PhotoUpload({ actaId, perfilId, fotos, fotoPendiente, onSubida }: Props) {
  const { mostrarError } = useToast();
  const [comprimiendo, setComprimiendo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ultimaFoto = fotos[0];

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
    if (!archivo) return;
    setComprimiendo(true);
    try {
      const comprimido = await comprimirFoto(archivo);
      await encolarFoto({ actaId, blob: comprimido, uploadedBy: perfilId });
      onSubida();
    } catch {
      mostrarError("No se pudo procesar la foto. Intenta de nuevo.");
    } finally {
      setComprimiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const hayFoto = !!ultimaFoto || !!fotoPendiente;

  return (
    <div className="foto-acta">
      {previewUrl && <img src={previewUrl} alt="Foto del acta" className="foto-acta-preview" />}

      {fotoPendiente && (
        <p className={`estado estado-sync-${fotoPendiente.syncStatus.toLowerCase()}`}>
          {SYNC_LABEL[fotoPendiente.syncStatus] ?? fotoPendiente.syncStatus}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleArchivo}
        style={{ display: "none" }}
        id={`foto-${actaId}`}
      />
      <label htmlFor={`foto-${actaId}`} className="boton-foto">
        {comprimiendo ? "Procesando..." : hayFoto ? "Reemplazar foto" : "Subir foto del acta"}
      </label>
    </div>
  );
}
