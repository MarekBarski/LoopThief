import { ScreenFrame } from "./ScreenFrame";
import { isPadAssigned, useAppStore } from "../store/useAppStore";
import { getPadModeDisplayLabel } from "../utils/padModeLabels";

const softButtons = ["F1 TC", "F2 CHOP", "F3 PROGRAM", "F4 STEP", "F5 SONG", "F6 SEQ"];

export function MainScreen() {
  const sequence = useAppStore((state) => state.sequence);
  const sequenceName = useAppStore((state) => state.sequenceName);
  const sequenceLengthBars = useAppStore((state) => state.sequenceLengthBars);
  const timeSignature = useAppStore((state) => state.timeSignature);
  const bar = useAppStore((state) => state.bar);
  const bpm = useAppStore((state) => state.bpm);
  const swing = useAppStore((state) => state.swing);
  const timingCorrect = useAppStore((state) => state.timingCorrect);
  const quantizeStrength = useAppStore((state) => state.quantizeStrength);
  const activeTrack = useAppStore((state) => state.activeTrack);
  const activeProgram = useAppStore((state) => state.activeProgram);
  const padBank = useAppStore((state) => state.padBank);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const currentPadMode = useAppStore((state) => state.currentPadMode);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const isSequenceRecording = useAppStore((state) => state.isSequenceRecording);
  const stepEvents = useAppStore((state) => state.stepEvents);
  const padAssignments = useAppStore((state) => state.padAssignments);
  const unassignedEventCount = stepEvents.filter((event) => !isPadAssigned({ padAssignments, padBank }, event.pad)).length;

  const mainFields = [
    ["SEQ", `${sequence} ${sequenceName}`],
    ["BARS", String(sequenceLengthBars).padStart(3, "0")],
    ["POS", bar],
    ["BPM", bpm.toFixed(2)],
    ["TIME SIG", timeSignature],
    ["TRACK", activeTrack],
    ["TYPE", "DRUM"],
    ["PROGRAM", activeProgram],
    ["PAD BANK", padBank],
    ["SELECTED PAD", selectedPad],
    ["PAD MODE", getPadModeDisplayLabel(currentPadMode)],
    ["TC", timingCorrect],
    ["SWING", `${swing}%`],
    ["Q-STRENGTH", `${quantizeStrength}%`],
    ["STATUS", `${isPlaying ? "PLAY" : "STOP"}${isSequenceRecording ? " / SEQ REC" : ""}`],
    ["SEQ AUDIO", unassignedEventCount > 0 ? `UNASSIGNED PAD x${unassignedEventCount}` : "ASSIGNED"],
  ] as const;
  const openUtilityWorkflow = useAppStore((state) => state.openUtilityWorkflow);

  return (
    <ScreenFrame title="MAIN" subtitle="MPC-style sequence control">
      <div className="grid h-full grid-rows-[minmax(0,1fr)_44px] gap-[3%] pb-[1%]">
        <div className="grid grid-cols-2 gap-x-[8%] gap-y-[5%] border border-[#46533b] bg-black/20 p-[3.4%]">
          {mainFields.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[auto_1fr] gap-[6%] text-[clamp(11px,0.92vw,15px)] tracking-[0.16em]">
              <span className="text-[#91a477]">{label}:</span>
              <span className="text-[#eef6d8]">{value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-6 gap-[1.4%] pt-[0.8%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 TC") openUtilityWorkflow("TIMING_CORRECT");
                if (button === "F5 SONG") openUtilityWorkflow("SONG");
                if (button === "F6 SEQ") openUtilityWorkflow("SEQUENCE_EDIT");
              }}
              className="border border-[#46533b] bg-black/25 px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] text-[#d8e3b7]"
            >
              {button}
            </button>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}
