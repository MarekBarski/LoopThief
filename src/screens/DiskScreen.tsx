import { useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 IMPORT", "F2 PREVIEW", "F3 RENAME", "F4 DELETE", "F5 EXPORT", "F6 EXIT"];

export function DiskScreen() {
  const diskFolders = useAppStore((state) => state.diskFolders);
  const activeDiskFolderId = useAppStore((state) => state.activeDiskFolderId);
  const selectedDiskItemIndex = useAppStore((state) => state.selectedDiskItemIndex);
  const recordedSamples = useAppStore((state) => state.recordedSamples);
  const padAssignments = useAppStore((state) => state.padAssignments);
  const openDiskFolder = useAppStore((state) => state.openDiskFolder);
  const selectDiskItem = useAppStore((state) => state.selectDiskItem);
  const importWavFile = useAppStore((state) => state.importWavFile);
  const previewSelectedMemorySample = useAppStore((state) => state.previewSelectedMemorySample);
  const renameSelectedMemorySample = useAppStore((state) => state.renameSelectedMemorySample);
  const deleteSelectedMemorySample = useAppStore((state) => state.deleteSelectedMemorySample);
  const exportSelectedMemorySample = useAppStore((state) => state.exportSelectedMemorySample);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);
  const importStatus = useAppStore((state) => state.importStatus);
  const importMessage = useAppStore((state) => state.importMessage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const memoryRows = recordedSamples.map((sample) => createMemoryRow(sample, padAssignments));
  const selectedMemoryRow = memoryRows[selectedDiskItemIndex] ?? memoryRows[0];

  return (
    <ScreenFrame title="DISK" subtitle="Project utility">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.78fr_1.22fr_0.95fr] gap-[2.3%] overflow-hidden">
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">DEVICE</p>
            {diskFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => openDiskFolder(folder.id)}
                className={`border px-[4%] py-[3%] text-left ${
                  folder.id === activeDiskFolderId
                    ? "border-amber-300 bg-amber-200/15 text-amber-100"
                    : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
                }`}
              >
                {folder.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => openDiskFolder("memory")}
              className={`border px-[4%] py-[3%] text-left ${
                activeDiskFolderId === "memory"
                  ? "border-amber-300 bg-amber-200/15 text-amber-100"
                  : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
              }`}
            >
              RUNTIME MEMORY
            </button>
          </section>

          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[1fr_0.58fr_0.72fr_0.72fr_0.7fr] border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(8px,0.66vw,10px)] tracking-[0.16em] text-[#91a477]">
              <span>NAME</span>
              <span>TYPE</span>
              <span>LENGTH</span>
              <span>RATE</span>
              <span>PAD</span>
            </div>
            <div className="grid content-start">
              {memoryRows.length === 0 ? (
                <div className="px-[3%] py-[5%] text-[clamp(9px,0.7vw,11px)] tracking-[0.14em] text-[#91a477]">
                  IMPORT WAV FILES TO MEMORY
                </div>
              ) : memoryRows.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectDiskItem(index)}
                  className={`grid grid-cols-[1fr_0.58fr_0.72fr_0.72fr_0.7fr] px-[3%] py-[2%] text-left text-[clamp(8px,0.66vw,10px)] tracking-[0.12em] ${
                    index === selectedDiskItemIndex
                      ? "bg-amber-200/15 text-amber-100"
                      : "text-[#d8e3b7]"
                  }`}
                >
                  <span className="truncate">{item.name}</span>
                  <span>{item.type}</span>
                  <span>{item.length}</span>
                  <span>{item.sampleRate}</span>
                  <span>{item.assignedPad}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="SELECTED" value={selectedMemoryRow?.name ?? "---"} />
            <Info label="TYPE" value={selectedMemoryRow?.type ?? "---"} />
            <Info label="LENGTH" value={selectedMemoryRow?.length ?? "--:--.---"} />
            <Info label="SAMPLE RATE" value={selectedMemoryRow?.sampleRate ?? "---"} />
            <Info label="ASSIGNED PAD" value={selectedMemoryRow?.assignedPad ?? "---"} />
            <Info label="IMPORT" value={importStatus} />
            <Info label="STATUS" value={importMessage} />
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,audio/wav,audio/x-wav"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) void importWavFile(file);
            }}
          />
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 IMPORT") fileInputRef.current?.click();
                if (button === "F2 PREVIEW") previewSelectedMemorySample();
                if (button === "F3 RENAME") {
                  const currentName = selectedMemoryRow?.name ?? "";
                  const nextName = window.prompt("Rename sample", currentName);
                  if (nextName) renameSelectedMemorySample(nextName);
                }
                if (button === "F4 DELETE") deleteSelectedMemorySample();
                if (button === "F5 EXPORT") exportSelectedMemorySample();
                if (button === "F6 EXIT") setActiveScreen("MAIN");
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

type MemoryRow = {
  id: string;
  name: string;
  type: "SAMPLE" | "SLICE";
  length: string;
  sampleRate: string;
  assignedPad: string;
};

type MemorySample = {
  id: string;
  name: string;
  durationMs: number;
  sampleRate: number;
};

function createMemoryRow(
  sample: MemorySample,
  padAssignments: Record<string, Array<{ pad: string; assignment: string }>>,
): MemoryRow {
  return {
    id: sample.id,
    name: sample.name,
    type: /_S\d{2}$/.test(sample.name) ? "SLICE" : "SAMPLE",
    length: formatMs(sample.durationMs),
    sampleRate: `${Math.round(sample.sampleRate / 100) / 10}K`,
    assignedPad: assignedPadsForSample(sample.name, padAssignments),
  };
}

function assignedPadsForSample(
  sampleName: string,
  padAssignments: Record<string, Array<{ pad: string; assignment: string }>>,
) {
  const pads: string[] = [];
  Object.entries(padAssignments).forEach(([bank, assignments]) => {
    assignments.forEach((assignment) => {
      if (assignment.assignment === sampleName || assignment.assignment.startsWith(`${sampleName} /`)) {
        pads.push(`${bank}${assignment.pad.slice(1)}`);
      }
    });
  });
  return pads.length > 0 ? pads.join(",") : "---";
}

function formatMs(value: number) {
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(value % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-[4%]">
      <span className="text-[#91a477]">{label}</span>
      <span className="text-[#eef6d8]">{value}</span>
    </div>
  );
}
