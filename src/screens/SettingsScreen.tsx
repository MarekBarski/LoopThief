import { useState, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { EditableNumber } from "../components/EditableNumber";
import packageJson from "../../package.json";
import { isTauri } from "../runtime/environment";

const softButtons = [
  "F1 VOL",
  "F2 AUDIO",
  "F3 AUTOSAVE",
  "F4 MIDI",
  "F5 KEYS",
  "F6 INFO",
] as const;

const categoryByFKey: Record<string, string> = {
  "F1 VOL": "masterVolume",
  "F2 AUDIO": "audio",
  "F3 AUTOSAVE": "autosave",
  "F4 MIDI": "midi",
  "F5 KEYS": "keyboard",
  "F6 INFO": "system",
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
            <button
              type="button"
              onClick={onSave}
              className="mt-[6px] border border-amber-300 bg-amber-200/10 px-[4%] py-[3%] text-left text-amber-100 hover:bg-amber-200/20"
            >
              SAVE
            </button>
            {saveStatus && (
              <p className="text-[10px] tracking-[0.16em] text-amber-200">{saveStatus}</p>
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
              {activeCategory.id === "audio" && <AudioPanel />}
              {activeCategory.id === "midi" && <MidiPlaceholder />}
              {activeCategory.id === "keyboard" && <KeyboardReference />}
              {activeCategory.id === "system" && <SystemInfo />}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => {
            // F2 AUDIO is Tauri-only; in browser mode the button is greyed
            // out (the AUDIO category itself reads as a placeholder there).
            const isAudio = button === "F2 AUDIO";
            const audioDisabled = isAudio && !isTauri();
            const isActive = categoryByFKey[button] === activeCategoryId;
            return (
              <button
                key={button}
                type="button"
                disabled={audioDisabled}
                onClick={() => {
                  const target = categoryByFKey[button];
                  if (target) {
                    setActiveSettingsCategory(target);
                    selectSetting(0);
                  }
                }}
                title={audioDisabled ? "Available in desktop app only" : undefined}
                className={`border border-[#46533b] px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-40 ${
                  isActive
                    ? "bg-amber-200/15 text-amber-100"
                    : "bg-black/25 text-[#d8e3b7]"
                }`}
              >
                {button}
              </button>
            );
          })}
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
  const hasAutosaveEntry = useAppStore((state) => state.hasAutosaveEntry);
  const loadLatestAutosave = useAppStore((state) => state.loadLatestAutosave);
  const [autosaveAvailable, setAutosaveAvailable] = useState<boolean | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [loadMessage, setLoadMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void hasAutosaveEntry().then((exists) => {
      if (!cancelled) setAutosaveAvailable(exists);
    });
    return () => {
      cancelled = true;
    };
  }, [hasAutosaveEntry]);

  const handleLoad = async () => {
    setLoadStatus("loading");
    setLoadMessage("Restoring…");
    const result = await loadLatestAutosave();
    if (result.ok) {
      setLoadStatus("done");
      setLoadMessage(result.message);
      setConfirmOpen(false);
    } else {
      setLoadStatus("error");
      setLoadMessage(result.message);
    }
  };

  const loadDisabled = autosaveAvailable === false || loadStatus === "loading";
  const loadLabel = autosaveAvailable === false
    ? "NO AUTOSAVE FOUND"
    : loadStatus === "loading"
      ? "RESTORING…"
      : "LOAD LAST AUTOSAVE";

  return (
    <div className="relative grid content-start gap-[14px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
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
        Writes are skipped while playing / recording / sampling.
      </p>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={loadDisabled}
        className="border border-amber-300 bg-amber-200/10 px-[3%] py-[3%] text-left text-amber-100 hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:border-[#46533b] disabled:bg-black/15 disabled:text-[#46533b]"
      >
        {loadLabel}
      </button>
      {loadStatus === "done" && (
        <p className="text-[clamp(9px,0.7vw,11px)] text-amber-200">{loadMessage}</p>
      )}
      {loadStatus === "error" && (
        <p className="text-[clamp(9px,0.7vw,11px)] text-red-300">{loadMessage}</p>
      )}
      {confirmOpen && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/65 p-[5%]">
          <section className="w-[min(440px,90%)] border border-[#91a477] bg-[#0a0d08] p-[18px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_20px_rgba(0,0,0,0.7)]">
            <p className="mb-[8px] text-[#eef6d8]">RESTORE AUTOSAVED PROJECT?</p>
            <p className="mb-[14px] text-[10px] text-[#91a477]">Current work will be lost.</p>
            {loadStatus === "error" && (
              <p className="mb-[10px] text-[10px] text-red-300">{loadMessage}</p>
            )}
            <div className="grid grid-cols-2 gap-[8px]">
              <button
                type="button"
                onClick={() => void handleLoad()}
                disabled={loadStatus === "loading"}
                className="border border-amber-300 bg-amber-200/10 px-[10px] py-[8px] text-amber-100 hover:bg-amber-200/20 disabled:opacity-50"
              >
                {loadStatus === "loading" ? "RESTORING…" : "YES"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  if (loadStatus === "error") {
                    setLoadStatus("idle");
                    setLoadMessage("");
                  }
                }}
                disabled={loadStatus === "loading"}
                className="border border-[#46533b] bg-black/25 px-[10px] py-[8px] text-[#d8e3b7] hover:border-amber-300 disabled:opacity-50"
              >
                NO
              </button>
            </div>
          </section>
        </div>
      )}
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
    {
      title: "WINDOW (Tauri only)",
      rows: [
        ["F11", "Toggle fullscreen"],
        ["Ctrl+Q", "Quit"],
        ["Alt+F4", "Quit (Windows)"],
        ["Quit button", "Top right corner"],
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

// ============================================================
// AUDIO panel — Tauri-only (cpal/WASAPI). 8 fields + APPLY button.
// Dirty tracking: hot-swap fields (Input / Output / Monitor) apply
// immediately; dirty fields (Sample Rate / Buffer Size / Bit Depth /
// Channels / WASAPI Mode) wait for APPLY & RESTART.
// ============================================================
function AudioPanel() {
  const audioConfig = useAppStore((s) => s.audioConfig);
  const appliedAudioConfig = useAppStore((s) => s.appliedAudioConfig);
  const audioDevices = useAppStore((s) => s.audioDevices);
  const audioBitDepth = useAppStore((s) => s.audioBitDepth);
  const audioStatusMessage = useAppStore((s) => s.audioStatusMessage);
  const refreshAudioDevices = useAppStore((s) => s.refreshAudioDevices);
  const setAudioInputDevice = useAppStore((s) => s.setAudioInputDevice);
  const setAudioOutputDevice = useAppStore((s) => s.setAudioOutputDevice);
  const setAudioMonitorMode = useAppStore((s) => s.setAudioMonitorMode);
  const setAudioSampleRate = useAppStore((s) => s.setAudioSampleRate);
  const setAudioBufferSize = useAppStore((s) => s.setAudioBufferSize);
  const setAudioChannels = useAppStore((s) => s.setAudioChannels);
  const setAudioWasapiMode = useAppStore((s) => s.setAudioWasapiMode);
  const setAudioBitDepth = useAppStore((s) => s.setAudioBitDepth);
  const applyAudioSettings = useAppStore((s) => s.applyAudioSettings);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (isTauri()) void refreshAudioDevices();
  }, [refreshAudioDevices]);

  if (!isTauri()) {
    return (
      <div className="grid content-start gap-[8px] text-[clamp(10px,0.78vw,12px)] tracking-[0.14em] text-[#91a477]">
        <p className="text-amber-200">AUDIO settings available in desktop app only.</p>
        <p className="text-[#d8e3b7]">Browser dev mode uses getDisplayMedia / getUserMedia fallback.</p>
      </div>
    );
  }

  // Dirty if any of the restart-required fields differs from applied.
  const dirty =
    audioConfig.sampleRate !== appliedAudioConfig.sampleRate ||
    audioConfig.bufferSize !== appliedAudioConfig.bufferSize ||
    audioConfig.channels !== appliedAudioConfig.channels ||
    audioConfig.wasapiMode !== appliedAudioConfig.wasapiMode;

  const inputs = audioDevices.filter((d) => d.kind === "input" || d.kind === "loopback");
  const outputs = audioDevices.filter((d) => d.kind === "output");
  const monitorLocked = (audioConfig.inputDeviceId ?? "").startsWith("loopback::");
  const isWindows = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("win");

  const handleApply = async () => {
    setApplying(true);
    try {
      await applyAudioSettings();
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="grid content-start gap-[10px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
      <AudioRow label="INPUT DEVICE">
        <select
          value={audioConfig.inputDeviceId ?? ""}
          onChange={(e) => void setAudioInputDevice(e.target.value)}
          className="min-w-0 truncate border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
        >
          {inputs.length === 0 && <option value="">(no devices)</option>}
          {inputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.kind === "loopback" ? d.name : d.name}{d.isDefault ? " ★" : ""}
            </option>
          ))}
        </select>
      </AudioRow>

      <AudioRow label="OUTPUT DEVICE">
        <select
          value={audioConfig.outputDeviceId ?? ""}
          onChange={(e) => void setAudioOutputDevice(e.target.value)}
          className="min-w-0 truncate border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
        >
          <option value="">(system default)</option>
          {outputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}{d.isDefault ? " ★" : ""}
            </option>
          ))}
        </select>
      </AudioRow>

      <AudioRow label="SAMPLE RATE" dirty={audioConfig.sampleRate !== appliedAudioConfig.sampleRate}>
        <select
          value={audioConfig.sampleRate}
          onChange={(e) => setAudioSampleRate(Number(e.target.value))}
          className="border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
        >
          <option value={44100}>44.1 kHz</option>
          <option value={48000}>48 kHz</option>
          <option value={88200}>88.2 kHz</option>
          <option value={96000}>96 kHz</option>
        </select>
      </AudioRow>

      <AudioRow label="BUFFER SIZE" dirty={audioConfig.bufferSize !== appliedAudioConfig.bufferSize}>
        <select
          value={audioConfig.bufferSize}
          onChange={(e) => setAudioBufferSize(Number(e.target.value))}
          className="border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
        >
          <option value={64}>64 samples</option>
          <option value={128}>128 samples</option>
          <option value={256}>256 samples</option>
          <option value={512}>512 samples</option>
          <option value={1024}>1024 samples</option>
        </select>
      </AudioRow>

      <AudioRow label="BIT DEPTH">
        <select
          value={audioBitDepth}
          onChange={(e) => setAudioBitDepth(Number(e.target.value) as 16 | 24 | 32)}
          className="border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
        >
          <option value={16}>16-bit (classic)</option>
          <option value={24}>24-bit</option>
          <option value={32}>32-bit float</option>
        </select>
      </AudioRow>

      <AudioRow label="CHANNELS" dirty={audioConfig.channels !== appliedAudioConfig.channels}>
        <select
          value={audioConfig.channels}
          onChange={(e) => setAudioChannels(Number(e.target.value) as 1 | 2)}
          className="border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
        >
          <option value={1}>Mono</option>
          <option value={2}>Stereo</option>
        </select>
      </AudioRow>

      {isWindows && (
        <AudioRow label="WASAPI MODE" dirty={audioConfig.wasapiMode !== appliedAudioConfig.wasapiMode}>
          <select
            value={audioConfig.wasapiMode}
            onChange={(e) => setAudioWasapiMode(e.target.value as "shared" | "exclusive")}
            className="border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300"
          >
            <option value="shared">Shared</option>
            <option value="exclusive">Exclusive</option>
          </select>
        </AudioRow>
      )}

      <AudioRow label="MONITOR" locked={monitorLocked} lockedReason="Locked off for loopback input">
        <select
          value={monitorLocked ? "off" : audioConfig.monitorMode}
          onChange={(e) => void setAudioMonitorMode(e.target.value as "off" | "direct" | "throughfx")}
          disabled={monitorLocked}
          className="border border-[#46533b] bg-black/40 px-[6px] py-[3px] text-[#eef6d8] outline-none focus:border-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <option value="off">Off</option>
          <option value="direct">Direct</option>
          <option value="throughfx">Through FX</option>
        </select>
      </AudioRow>

      {dirty && (
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={applying}
          className="mt-[6px] border border-amber-300 bg-amber-200/10 px-[10px] py-[8px] text-left text-amber-100 hover:bg-amber-200/20 disabled:opacity-50"
        >
          {applying ? "RESTARTING…" : "APPLY & RESTART AUDIO"}
        </button>
      )}

      {audioStatusMessage && (
        <p className="mt-[4px] text-[10px] tracking-[0.16em] text-amber-200">{audioStatusMessage}</p>
      )}
    </div>
  );
}

function AudioRow({
  label,
  dirty,
  locked,
  lockedReason,
  children,
}: {
  label: string;
  dirty?: boolean;
  locked?: boolean;
  lockedReason?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-[10px] border border-[#46533b] bg-black/15 px-[10px] py-[5px]">
      <span className="flex items-center gap-[6px] text-[#91a477]">
        {label}
        {dirty && <span className="text-amber-300" title="Restart required">●</span>}
        {locked && lockedReason && (
          <span className="text-[9px] text-[#46533b]" title={lockedReason}>(locked)</span>
        )}
      </span>
      {children}
    </div>
  );
}
