export type RGB = { r: number; g: number; b: number };

export type RegionId =
  | "capital"
  | "central"
  | "andina"
  | "occidental"
  | "los-llanos"
  | "guayana"
  | "oriental"
  | "zuliana"
  | "nor-oriental"
  | "insular";

export type RegionInfo = {
  id: RegionId;
  label: string;
  colors: RGB[]; // colores representativos en el SVG que mapean a esta gerencia
  states?: string[];
};

export const REGIONS: RegionInfo[] = [
  { id: "capital", label: "Gerencia Regional Capital", colors: [
    { r: 200, g: 40, b: 40 },
    { r: 9, g: 141, b: 214 }, // #098DD6 reportado por el usuario
  ], states: ["Distrito Capital", "Miranda", "Vargas/La Guaira"] },
  { id: "central", label: "Gerencia Regional Central", colors: [
    { r: 240, g: 160, b: 40 },
    { r: 225, g: 80, b: 12 }, // #E1500C reportado por el usuario
  ], states: ["Aragua", "Carabobo"] },
  { id: "andina", label: "Gerencia Regional Los Andes", colors: [{ r: 60, g: 130, b: 60 }], states: ["Mérida", "Táchira", "Trujillo"] },
  { id: "occidental", label: "Gerencia Regional Occidental", colors: [{ r: 140, g: 80, b: 60 }], states: ["Falcón", "Yaracuy"] },
  { id: "los-llanos", label: "Gerencia Regional Los Llanos", colors: [
    { r: 230, g: 200, b: 80 },
    { r: 245, g: 159, b: 4 }, // #F59F04 reportado por el usuario
  ], states: ["Apure", "Barinas", "Guárico", "Cojedes", "Portuguesa"] },
  { id: "guayana", label: "Gerencia Regional Guayana", colors: [
    { r: 120, g: 120, b: 200 },
    { r: 6, g: 124, b: 77 }, // #067C4D reportado por el usuario
  ], states: ["Bolívar", "Amazonas", "Delta Amacuro"] },
  { id: "oriental", label: "Gerencia Regional Oriental", colors: [{ r: 80, g: 160, b: 200 }], states: ["Anzoátegui", "Sucre", "Monagas"] },
  { id: "zuliana", label: "Gerencia Regional Zuliana", colors: [
    { r: 60, g: 60, b: 60 },
    { r: 244, g: 225, b: 4 }, // #F4E104 reportado por el usuario
  ], states: ["Zulia"] },
  // Nueva asignación confirmada por el usuario:
  // #DCBBB9 => (220, 187, 185)
  { id: "nor-oriental", label: "Gerencia Regional de Tributos Internos Nor-Oriental", colors: [
    { r: 220, g: 187, b: 185 }, // #DCBBB9
    { r: 209, g: 11, b: 27 },   // #D10B1B (click reportado)
  ], states: ["Nueva Esparta", "Sucre (parte)", "Anzoátegui (parte)"] },
  { id: "insular", label: "Gerencia Regional de Tributos Internos Región Insular", colors: [
    { r: 30, g: 144, b: 255 }, // #1E90FF (nuevo color para distinguir de Capital)
  ], states: ["Nueva Esparta", "Dependencias Federales"] },
];

export const colorDistance = (a: RGB, b: RGB) => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

export function resolveRegionByColor(color: RGB, tolerance: number = 48): RegionInfo | null {
  // 1) Recolectar candidatos dentro de la tolerancia y elegir el más cercano
  let bestWithinTol: { region: RegionInfo; d: number } | null = null;
  for (const region of REGIONS) {
    for (const ref of region.colors) {
      const inTol =
        Math.abs(ref.r - color.r) <= tolerance &&
        Math.abs(ref.g - color.g) <= tolerance &&
        Math.abs(ref.b - color.b) <= tolerance;
      if (inTol) {
        const d = colorDistance(ref, color);
        if (!bestWithinTol || d < bestWithinTol.d) bestWithinTol = { region, d };
      }
    }
  }
  if (bestWithinTol) return bestWithinTol.region;

  // 2) Si no hay ninguno dentro de tolerancia, usar el más cercano global
  let best: { region: RegionInfo; d: number } | null = null;
  for (const region of REGIONS) {
    for (const ref of region.colors) {
      const d = colorDistance(ref, color);
      if (!best || d < best.d) best = { region, d };
    }
  }
  return best ? best.region : null;
}


