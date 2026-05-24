import { useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { isTauri } from "../runtime/environment";
import { ScreenFrame } from "./ScreenFrame";
import { lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 IMPORT", "F2 PREVIEW", "F3 RENAME", "F4 DELETE", "F5 EXPORT", "F6 EXIT"];

export function DiskScreen() {
  const selectedDiskItemIndex = useAppStore((state) => state.selectedDiskItemIndex);
  const recordedSamples = useAppStore((state) => state.recordedSamples);
  const padAssignments = useAppStore((state) => state.padAssignments);
  const selectDiskItem = useAppStore((state) => state.selectDiskItem);
  const importWavFile = useAppStore((state) => state.importWavFile);
  const previewSelectedMemorySample = useAppStore((state) => state.previewSelectedMemorySample);
  const renameSelectedMemorySample = useAppStore((state) => state.renameSelectedMemorySample);
  const deleteSelectedMemorySample = useAppStore((state) => state.deleteSelectedMemorySample);
  const exportSelectedMemorySample = useAppStore((state) => state.exportSelectedMemorySample);
  const setActiveScreen = useAppStore((state) => state.setActiveScreen);
  const importStatus = useAppStore((state) => state.importStatus);
  const importMessage = useAppStore((state) => state.importMessage);
  // HTML file inputs kept for browser dev mode only — Tauri build routes
  // through the FileBrowser. These refs are unused (and the inputs hidden)
  // when isTauri() returns true.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const saveProjectFile = useAppStore((state) => state.saveProjectFile);
  const loadFile = useAppStore((state) => state.loadFile);
  const newProject = useAppStore((state) => state.newProject);
  const openFileBrowser = useAppStore((state) => state.openFileBrowser);

  const memoryRows = recordedSamples.map((sample) => createMemoryRow(sample, padAssignments));
  const selectedMemoryRow = memoryRows[selectedDiskItemIndex] ?? memoryRows[0];

  // Click handlers branch on runtime — Tauri opens the in-LCD FileBrowser,
  // browser dev falls back to the HTML <input type="file"> picker.
  const onSaveProject = () => {
    if (isTauri()) {
      void openFileBrowser("SAVE_PROJECT");
    } else {
      void saveProjectFile("project");
    }
  };
  const onLoadProject = () => {
    if (isTauri()) {
      void openFileBrowser("LOAD_PROJECT");
    } else {
      projectInputRef.current?.click();
    }
  };
  const onImportSample = () => {
    if (isTauri()) {
      void openFileBrowser("LOAD_SAMPLE");
    } else {
      fileInputRef.current?.click();
    }
  };
  const onExportSample = () => {
    if (isTauri()) {
      void openFileBrowser("SAVE_SAMPLE");
    } else {
      void exportSelectedMemorySample();
    }
  };

  return (
    <ScreenFrame title="DISK" subtitle="Project utility">
      <div className="flex h-full min-h-0 flex-col gap-[12px]">
        <div
          className="grid min-h-0 flex-1 grid-cols-[1.4fr_0.95fr] gap-[2.3%] overflow-hidden"
          style={{ gridTemplateRows: "minmax(0, 1fr)" }}
        >
          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[1fr_0.58fr_0.72fr_0.72fr_0.7fr] border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(8px,0.66vw,10px)] tracking-[0.16em] text-[#91a477]">
              <span>NAME</span>
              <span>TYPE</span>
              <span>LENGTH</span>
              <span>RATE</span>
              <span>PAD</span>
            </div>
            <div className="grid content-start min-h-0 overflow-y-auto">
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

          <section className="grid min-h-0 content-start gap-[8px] overflow-y-auto border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">PROJECT I/O</p>
            <button
              type="button"
              onClick={onSaveProject}
              className="border border-[#46533b] bg-black/25 px-[4%] py-[4%] text-left text-[#d8e3b7] hover:border-amber-300"
            >
              SAVE PROJECT (.lthief)
            </button>
            <button
              type="button"
              onClick={onLoadProject}
              className="border border-amber-300 bg-amber-200/10 px-[4%] py-[4%] text-left text-amber-100 hover:bg-amber-200/20"
            >
              LOAD PROJECT FILE...
            </button>
            <button
              type="button"
              onClick={() => void newProject()}
              className="border border-[#46533b] bg-black/25 px-[4%] py-[4%] text-left text-[#d8e3b7] hover:border-amber-300"
            >
              NEW PROJECT
            </button>
            {/* Browser-dev fallback HTML input — invisible, only fires when
                isTauri() is false (i.e. `npm run dev` without Tauri shell).
                Tauri build never uses this; the LOAD PROJECT click routes
                through openFileBrowser instead. */}
            <input
              ref={projectInputRef}
              type="file"
              accept=".lthief"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void loadFile(file);
              }}
            />
            <Info label="SELECTED SAMPLE" value={selectedMemoryRow?.name ?? "---"} />
            <Info label="IMPORT" value={importStatus} />
            <Info label="STATUS" value={importMessage} />
          </section>
        </div>

        <div
          className="grid flex-none grid-cols-6 gap-[1.4%]"
          style={{ height: lcdSoftkeyHeight }}
        >
          {/* Browser-dev fallback for WAV import. Same isTauri-gated story
              as projectInputRef above. */}
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
                if (button === "F1 IMPORT") onImportSample();
                if (button === "F2 PREVIEW") previewSelectedMemorySample();
                if (button === "F3 RENAME") {
                  const currentName = selectedMemoryRow?.name ?? "";
                  const nextName = window.prompt("Rename sample", currentName);
                  if (nextName) renameSelectedMemorySample(nextName);
                }
                if (button === "F4 DELETE") deleteSelectedMemorySample();
                if (button === "F5 EXPORT") onExportSample();
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
