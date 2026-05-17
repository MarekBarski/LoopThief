export const screens = [
  "MAIN",
  "RECORD",
  "CHOP",
  "PROGRAM",
  "STEP",
  "PERFORMANCE",
  "MIX",
  "DISK",
  "SETTINGS",
] as const;

export type ScreenId = (typeof screens)[number];
