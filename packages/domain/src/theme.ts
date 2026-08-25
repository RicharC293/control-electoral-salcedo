// Aplica el color semilla configurado por ADMIN (panel → Apariencia) como
// variables CSS en :root. Ambas apps (captura y panel) llaman esto una vez al
// arrancar. Sin color configurado, cae al azul por defecto (mismo valor que
// ya está hardcodeado como fallback estático en cada index.css, para que no
// haya un flash de color distinto antes de que corra este script).
const AZUL_POR_DEFECTO = "#0f172a";

function hexARgb(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "");
  const n = parseInt(limpio.length === 3 ? limpio.split("").map((c) => c + c).join("") : limpio, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbAHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function mezclar(rgb: [number, number, number], hacia: [number, number, number], cantidad: number): [number, number, number] {
  return [
    rgb[0] + (hacia[0] - rgb[0]) * cantidad,
    rgb[1] + (hacia[1] - rgb[1]) * cantidad,
    rgb[2] + (hacia[2] - rgb[2]) * cantidad,
  ];
}

const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/;

// Reutilizado fuera de este módulo (p.ej. la paleta de color de candidato en
// Candidatos.tsx) para generar un fondo tenue a partir de un color arbitrario
// elegido por el usuario, con el mismo criterio que el color semilla.
export function tintarColor(hex: string, cantidadHaciaBlanco = 0.88): string {
  if (!HEX_VALIDO.test(hex)) return hex;
  return rgbAHex(mezclar(hexARgb(hex), [255, 255, 255], cantidadHaciaBlanco));
}

export function aplicarColorSemilla(colorSemilla: string | null | undefined): void {
  if (typeof document === "undefined") return; // no-op en scripts/servidor
  const base = colorSemilla && HEX_VALIDO.test(colorSemilla) ? colorSemilla : AZUL_POR_DEFECTO;
  const rgb = hexARgb(base);
  const hover = rgbAHex(mezclar(rgb, [0, 0, 0], 0.18));
  const suave = rgbAHex(mezclar(rgb, [255, 255, 255], 0.92));

  const raiz = document.documentElement.style;
  raiz.setProperty("--color-primario", base);
  raiz.setProperty("--color-primario-hover", hover);
  raiz.setProperty("--color-primario-suave", suave);
  raiz.setProperty("--color-primario-rgb", rgb.join(" "));
}
