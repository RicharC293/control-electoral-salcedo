type Props = {
  telefono: string | null;
  mensaje: string | null;
};

export function SoporteCard({ telefono, mensaje }: Props) {
  if (!telefono) return null;

  const telefonoLimpio = telefono.replace(/[^\d]/g, "");
  const waHref = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje ?? "")}`;

  return (
    <div className="soporte-card">
      <a href={waHref} target="_blank" rel="noreferrer" className="boton-soporte">
        Contactar por WhatsApp
      </a>
      <a href={`tel:${telefonoLimpio}`} className="boton-soporte boton-soporte-secundario">
        Llamar a soporte ({telefono})
      </a>
    </div>
  );
}
