export const rateLabels: Record<string, string> = {
  roof_white: "Pérgola blanca · USD/ft²",
  roof_certified: "Pérgola certificada · USD/ft²",
  roof_composite: "Pérgola composite · USD/ft²",
  wall_panel: "Pared panel · USD/ft²",
  wall_composite: "Pared composite · USD/ft²",
  kitchen: "Cocina · USD/ft lineal",
  permit_fixed: "Permiso · precio fijo USD",
  permit_threshold: "Permiso · umbral ft²",
  permit_area: "Permiso sobre el umbral · USD/ft²",
  heavy_piece: "Refuerzo · USD/pieza",
};
export type DesignSpec = {
  length: string;
  width: string;
  height: string;
  roof: string;
  wall: string;
  color: string;
  wall_length: string;
  wall_height: string;
  kitchen_length: string;
  heavy_count: string;
  permit: boolean;
};
export const initialDesign: DesignSpec = {
  length: "20",
  width: "12",
  height: "9",
  roof: "white",
  wall: "none",
  color: "white",
  wall_length: "0",
  wall_height: "0",
  kitchen_length: "0",
  heavy_count: "0",
  permit: false,
};
export const dimensionLabels: Record<string, string> = {
  length: "Largo · ft",
  width: "Ancho · ft",
  height: "Altura · ft",
  wall_length: "Largo de pared · ft",
  wall_height: "Altura de pared · ft",
  kitchen_length: "Cocina e isla · ft lineales",
  heavy_count: "Piezas reforzadas",
};
export function designModule(kind: string) {
  return kind === "nuevo3d" || kind === "pergolamotor" ? kind : null;
}
