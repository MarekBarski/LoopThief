/**
 * MIDI ↔ pad mapping presets.
 *
 *  • MPC_NATIVE — 4 banks × 16 pads = 64 pads, starting at C1 (note 36).
 *    Bank A = 36–51, Bank B = 52–67, Bank C = 68–83, Bank D = 84–99.
 *  • GM_36_51 — only bank A (notes 36–51) responds; other banks ignore input
 *    and the user switches banks via UI.
 *
 * Channel is fixed at MIDI Channel 1 (matches MPC default).
 */

export type PadMappingPreset = "MPC_NATIVE" | "GM_36_51";
export type PadBank = "A" | "B" | "C" | "D";

export type PadAddress = { bank: PadBank; padIndex: number /* 0-15 */ };

const BANK_BASE: Record<PadBank, number> = {
  A: 36,
  B: 52,
  C: 68,
  D: 84,
};

const BANK_ORDER: PadBank[] = ["A", "B", "C", "D"];

export function noteToPad(note: number, preset: PadMappingPreset): PadAddress | null {
  if (preset === "GM_36_51") {
    if (note < 36 || note > 51) return null;
    return { bank: "A", padIndex: note - 36 };
  }
  // MPC_NATIVE
  for (const bank of BANK_ORDER) {
    const base = BANK_BASE[bank];
    if (note >= base && note < base + 16) {
      return { bank, padIndex: note - base };
    }
  }
  return null;
}

export function padToNote(bank: PadBank, padIndex: number, preset: PadMappingPreset): number | null {
  if (padIndex < 0 || padIndex > 15) return null;
  if (preset === "GM_36_51") {
    if (bank !== "A") return null;
    return 36 + padIndex;
  }
  return BANK_BASE[bank] + padIndex;
}

export function padIdToIndex(padId: string): number {
  // "P01" → 0, "P16" → 15
  const n = Number(padId.slice(1));
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(15, n - 1));
}

export function indexToPadId(index: number): string {
  return `P${String(index + 1).padStart(2, "0")}`;
}
