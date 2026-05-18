export function getPadModeDisplayLabel(label: string) {
  if (label === "PLAY" || label === "PAD_PLAY") return "PAD PLAY";
  if (label === "STEP" || label === "STEP_INPUT") return "STEP INPUT";
  return label;
}
