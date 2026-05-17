export type LayoutElementType =
  | "status"
  | "lcd"
  | "lcdContent"
  | "mode"
  | "button"
  | "padMode"
  | "pad"
  | "bank"
  | "mascot";

export type LayoutElement = {
  id: string;
  type: LayoutElementType;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  active?: boolean;
};

export type LayoutDocument = {
  elements: LayoutElement[];
};
