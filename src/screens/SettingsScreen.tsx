import { useState, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { EditableNumber } from "../components/EditableNumber";
import packageJson from "../../package.json";
import { isTauri } from "../runtime/environment";

const softButtons = [
  "F1 VOL",
  "F2 AUTOSAVE",
  "F3 MIDI",
  "F4 KEYS",
  "F5 INFO",
  "F6 SAVE",
] as const;

const categoryByFKey: Record<string, string> = {
  "F1 VOL": "masterVolume",
  "F2 AUTOSAVE": "autosave",
  "F3 MIDI": "midi",
  "F4 KEYS": "keyboard",
  "F5 INFO": "system",
};

export function SettingsScreen() {
  const categories = useAppStore((state) => state.settingsCategories);
  const activeCategoryId = useAppStore((state) => state.activeSettingsCategoryId);
  const values = useAppStore((state) => state.settingsValues);
  const setActiveSettingsCategory = useAppStore((state) => state.setActiveSettingsCategory);
  const setSelectedSetting = useAppStore((state) => state.setSelectedSetting);
  const adjustSelectedSetting = useAppStore((state) => state.adjustSelectedSetting);
  const toggleSelectedSetting = useAppStore((state) => state.toggleSelectedSetting);
  const selectSetting = useAppStore((state) => state.selectSetting);
  const persistSettingsNow = useAppStore((state) => state.persistSettingsNow);

  const [saveStatus, setSaveStatus] = useState<string>("");

  useEffect(() => {
    if (!saveStatus) return;
    const id = window.setTimeout(() => setSaveStatus(""), 2200);
    return () => window.clearTimeout(id);
  }, [saveStatus]);

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? categories[0];

  const onSave = () => {
    persistSettingsNow();
    setSaveStatus("Settings saved");
  };

  return (
    <ScreenFrame title="SETTINGS" subtitle="Workstation setup">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.72fr_1.6fr] gap-[2.3%] overflow-hidden">
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">CATEGORY</p>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setActiveSettingsCategory(category.id);
                  selectSetting(0);
                }}
                className={`border px-[4%] py-[3%] text-left ${
                  category.id === activeCategoryId
                    ? "border-amber-300 bg-amber-200/15 text-amber-100"
                    : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
                }`}
              >
                {category.label}
              </button>
            ))}
            {saveStatus && (
              <p className="mt-[6px] text-[10px] tracking-[0.16em] text-amber-200">{saveStatus}</p>
            )}
          </section>

          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(9px,0.7vw,11px)] tracking-[0.16em] text-[#91a477]">
              {activeCategory.label}
            </div>
            <div className="min-h-0 overflow-y-auto p-[3%]">
              {activeCategory.id === "masterVolume" && (
                <MasterVolumePanel
                  value={values.masterVolume}
                  onCommit={(v) => setSelectedSetting(Math.round(v))}
                  onAdjust={(delta) => adjustSelectedSetting(delta)}
                />
              )}
              {activeCategory.id === "autosave" && (
                <AutosavePanel
                  autosaveOn={values.autoSave}
                  intervalSec={values.autosaveIntervalSec}
                  onToggleAutosave={toggleSelectedSetting}
                  onIntervalCommit={(v) => setSelectedSetting(Math.round(v))}
                  onIntervalAdjust={(delta) => adjustSelectedSetting(delta)}
                  selectSettingIndex={selectSetting}
                />
              )}
              {activeCategory.id === "midi" && <MidiPlaceholder />}
              {activeCategory.id === "keyboard" && <KeyboardReference />}
              {activeCategory.id === "system" && <SystemInfo />}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F6 SAVE") {
                  onSave();
                  return;
                }
                const target = categoryByFKey[button];
                if (target) {
                  setActiveSettingsCategory(target);
                  selectSetting(0);
                }
              }}
              className={`border border-[#46533b] px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] ${
                button === "F6 SAVE"
                  ? "bg-amber-200/10 text-amber-100"
                  : "bg-black/25 text-[#d8e3b7]"
              }`}
            >
              {button}
            </button>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

function MasterVolumePanel({
  value,
  onCommit,
  onAdjust,
}: {
  value: number;
  onCommit: (v: number) => void;
  onAdjust: (delta: number) => void;
}) {
  return (
    <div className="grid content-start gap-[14px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
      <div className="grid grid-cols-[1fr_auto] items-center gap-[14px] border border-[#46533b] bg-black/15 px-[3%] py-[3%]">
        <span className="text-[#91a477]">MASTER VOL</span>
        <div className="flex items-center gap-[10px]">
          <button type="button" tabIndex={-1} onClick={() => onAdjust(-1)} className="border border-[#46533b] px-[8px] text-[#d8e3b7]">-</button>
          <EditableNumber
            value={value}
            format={(n) => `${n}%`}
            min={0}
            max={200}
            onCommit={onCommit}
            ariaLabel="MASTER VOL"
          />
          <button type="button" tabIndex={-1} onClick={() => onAdjust(1)} className="border border-[#46533b] px-[8px] text-[#d8e3b7]">+</button>
        </div>
      </div>
      <p className="text-[clamp(9px,0.7vw,11px)] tracking-[0.14em] text-[#91a477]">
        Range 0–200%. Affects all output. Persisted across sessions.
      </p>
    </div>
  );
}

function AutosavePanel({
  autosaveOn,
  intervalSec,
  onToggleAutosave,
  onIntervalCommit,
  onIntervalAdjust,
  selectSettingIndex,
}: {
  autosaveOn: boolean;
  intervalSec: number;
  onToggleAutosave: () => void;
  onIntervalCommit: (v: number) => void;
  onIntervalAdjust: (delta: number) => void;
  selectSettingIndex: (idx: number) => void;
}) {
  return (
    <div className="grid content-start gap-[14px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
      <button
        type="button"
        onClick={() => {
          selectSettingIndex(0);
          onToggleAutosave();
        }}
        className="grid grid-cols-[1fr_auto] items-center gap-[14px] border border-[#46533b] bg-black/15 px-[3%] py-[3%] text-left"
      >
        <span className="text-[#91a477]">AUTO SAVE</span>
        <span className="flex items-center gap-[8px] text-[#eef6d8]">
          <span className={`h-[10px] w-[18px] border border-[#46533b] ${autosaveOn ? "bg-[#d8e3b7]" : "bg-black/30"}`} />
          {autosaveOn ? "ON" : "OFF"}
        </span>
      </button>
      <div
        onClick={() => selectSettingIndex(1)}
        className="grid grid-cols-[1fr_auto] items-center gap-[14px] border border-[#46533b] bg-black/15 px-[3%] py-[3%]"
      >
        <span className="text-[#91a477]">INTERVAL SEC</span>
        <div className="flex items-center gap-[10px]">
          <button type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onIntervalAdjust(-1); }} className="border border-[#46533b] px-[8px] text-[#d8e3b7]">-</button>
          <EditableNumber
            value={intervalSec}
            format={(n) => `${n}s`}
            min={15}
            max={600}
            onCommit={onIntervalCommit}
            ariaLabel="INTERVAL SEC"
          />
          <button type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onIntervalAdjust(1); }} className="border border-[#46533b] px-[8px] text-[#d8e3b7]">+</button>
        </div>
      </div>
      <p className="text-[clamp(9px,0.7vw,11px)] tracking-[0.14em] text-[#91a477]">
        When ON, project state writes to IndexedDB every INTERVAL seconds.
      </p>
    </div>
  );
}

function MidiPlaceholder() {
  const midiAvailable = useAppStore((s) => s.midiAvailable);
  const midiInputs = useAppStore((s) => s.midiInputs);
  const midiOutputs = useAppStore((s) => s.midiOutputs);
  const settings = useAppStore((s) => s.settingsValues);
  const setMidiInputDevice = useAppStore((s) => s.setMidiInputDevice);
  const setMidiOutputDevice = useAppStore((s) => s.setMidiOutputDevice);
  const setMidiPadMapping = useAppStore((s) => s.setMidiPadMapping);
  const setMidiAutoBankSwitch = useAppStore((s) => s.setMidiAutoBankSwitch);
  const setMidiSyncIn = useAppStore((s) => s.setMidiSyncIn);
  const setMidiSyncOut = useAppStore((s) => s.setMidiSyncOut);
  const setMidiPadOut = useAppStore((s) => s.setMidiPadOut);

  if (!midiAvailable) {
    return (
      <div className="grid content-start gap-[10px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] text-[#aab691]">
        <p className="text-amber-200">MIDI not available in this browser.</p>
        <p className="text-[#d8e3b7]">Use Chrome, Edge, or Brave for MIDI support.</p>
        <p className="mt-[6px] text-[#91a477] text-[10px]">
          Or grant MIDI permission if you previously declined it. Browser must support Web MIDI API.
        </p>
      </div>
    );
  }

  return (
    <div className="grid content-start gap-[10px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
      <MidiSelectRow
        label="INPUT DEVICE"
        value={settings.midiInputDeviceId ?? ""}
        options={[{ id: "", name: "— none —" }, ...midiInputs]}
        onChange={(id) => setMidiInputDevice(id || null)}
      />
      <MidiSelectRow
        label="OUTPUT DEVICE"
        value={settings.midiOutputDeviceId ?? ""}
        options={[{ id: "", name: "— none —" }, ...midiOutputs]}
        onChange={(id) => setMidiOutputDevice(id || null)}
      />
      <MidiSelectRow
        label="PAD MAPPING"
        value={settings.midiPadMapping}
        options={[
          { id: "MPC_NATIVE", name: "MPC native (36-99, 4 banks)" },
          { id: "GM_36_51", name: "General MIDI 36-51 (bank A only)" },
        ]}
        onChange={(id) => setMidiPadMapping(id as "MPC_NATIVE" | "GM_36_51")}
      />
      <MidiToggleRow
        label="AUTO BANK SWITCH"
        value={settings.midiAutoBankSwitch}
        onChange={setMidiAutoBankSwitch}
      />
      <MidiSelectRow
        label="MIDI SYNC IN"
        value={settings.midiSyncIn}
        options={[
          { id: "OFF", name: "Off (internal clock)" },
          { id: "CLOCK", name: "MIDI Clock (slave)" },
        ]}
        onChange={(id) => setMidiSyncIn(id as "OFF" | "CLOCK")}
      />
      <MidiSelectRow
        label="MIDI SYNC OUT"
        value={settings.midiSyncOut}
        options={[
          { id: "OFF", name: "Off" },
          { id: "CLOCK", name: "MIDI Clock (master)" },
        ]}
        onChange={(id) => setMidiSyncOut(id as "OFF" | "CLOCK")}
      />
      <MidiToggleRow
        label="PAD MIDI OUT"
        value={settings.midiPadOut}
        onChange={setMidiPadOut}
      />
      <p className="mt-[6px] text-[10px] tracking-[0.14em] text-[#91a477]">
        Channel 1, velocity 0-127. CC routing on selected pad: 7 LEVEL · 10 PAN · 71 RES · 74 CUTOFF · 91 FX SEND.
      </p>
    </div>
  );
}

function MidiSelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string }>;
  onChange: (id: string) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_1.4fr] items-center gap-[14px] border border-[#46533b] bg-black/15 px-[3%] py-[3%]">
      <span className="text-[#91a477]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function MidiToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="grid grid-cols-[1fr_auto] items-center gap-[14px] border border-[#46533b] bg-black/15 px-[3%] py-[3%] text-left"
    >
      <span className="text-[#91a477]">{label}</span>
      <span className="flex items-center gap-[8px] text-[#eef6d8]">
        <span className={`h-[10px] w-[18px] border border-[#46533b] ${value ? "bg-[#d8e3b7]" : "bg-black/30"}`} />
        {value ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function KeyboardReference() {
  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: "PADS",
      rows: [
        ["1  2  3  4", "P01 – P04"],
        ["Q  W  E  R", "P05 – P08"],
        ["A  S  D  F", "P09 – P12"],
        ["Z  X  C  V", "P13 – P16"],
      ],
    },
    {
      title: "BANKS",
      rows: [
        ["7  8  9  0", "Bank A / B / C / D direct"],
        ["Tab", "Cycle banks forward"],
        ["Shift+Tab", "Cycle banks reverse"],
      ],
    },
    {
      title: "TRANSPORT",
      rows: [
        ["Space", "PLAY / STOP toggle"],
        ["Shift+Space", "REC + PLAY"],
      ],
    },
    {
      title: "TRACKS",
      rows: [
        ["M", "Mute selected track"],
        ["O", "Overdub toggle"],
      ],
    },
    {
      title: "DIALOGS",
      rows: [
        ["Esc", "Cancel / close"],
        ["Enter", "Confirm"],
        ["Delete", "Delete selection"],
      ],
    },
    {
      title: "EDIT",
      rows: [
        ["Ctrl+Z", "Undo"],
        ["Ctrl+Shift+Z", "Redo"],
        ["Ctrl+Y", "Redo (alternative)"],
        ["Ctrl+S", "Save project"],
      ],
    },
    {
      title: "SOFTKEYS",
      rows: [["F1 – F6", "Screen-specific actions"]],
    },
    {
      title: "NUMERIC INPUT",
      rows: [
        ["Click value", "Enter edit mode"],
        ["Enter", "Confirm value"],
        ["Esc", "Cancel / revert"],
        ["Tab", "Confirm + next field"],
      ],
    },
  ];

  return (
    <div className="grid grid-cols-2 content-start gap-x-[18px] gap-y-[14px] text-[clamp(9px,0.72vw,11px)] tracking-[0.10em]">
      {groups.map((group) => (
        <div key={group.title} className="grid content-start gap-[5px]">
          <p className="text-[#91a477]">{group.title}</p>
          <div className="grid gap-[3px]">
            {group.rows.map(([keys, label]) => (
              <div key={keys} className="grid grid-cols-[0.9fr_1.1fr] gap-[8px] border border-[#46533b]/60 bg-black/15 px-[6px] py-[3px]">
                <span className="font-mono text-[#eef6d8]">{keys}</span>
                <span className="text-[#d8e3b7]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemInfo() {
  const audioContextState = typeof window !== "undefined" && "AudioContext" in window ? "available" : "unavailable";
  const runningInTauri = isTauri();
  const userAgentLine = typeof navigator !== "undefined" ? navigator.userAgent : "n/a";
  const buildDate = (() => {
    try {
      return new Date(__BUILD_DATE__).toISOString().slice(0, 19).replace("T", " ") + " UTC";
    } catch {
      return "unknown";
    }
  })();

  const rows: Array<[string, string]> = [
    ["Project", "LoopThief / Thief OS"],
    ["Coded by", "Marek Barski"],
    ["Version", packageJson.version],
    ["Build date", buildDate],
    ["Runtime", runningInTauri ? "Tauri native" : "browser"],
    ["AudioContext", audioContextState],
    ["User agent", userAgentLine.length > 64 ? userAgentLine.slice(0, 64) + "..." : userAgentLine],
  ];

  return (
    <div className="grid content-start gap-[8px] text-[clamp(10px,0.78vw,12px)] tracking-[0.12em]">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[140px_1fr] gap-[12px] border border-[#46533b]/60 bg-black/15 px-[10px] py-[5px]">
          <span className="text-[#91a477]">{label}</span>
          <span className="truncate text-[#eef6d8]">{value}</span>
        </div>
      ))}
    </div>
  );
}
