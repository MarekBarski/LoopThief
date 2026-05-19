import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 MIDI", "F2 AUDIO", "F3 SYNC", "F4 CLICK", "F5 SYSTEM", "F6 SAVE"];

export function SettingsScreen() {
  const categories = useAppStore((state) => state.settingsCategories);
  const activeCategoryId = useAppStore((state) => state.activeSettingsCategoryId);
  const selectedSettingIndex = useAppStore((state) => state.selectedSettingIndex);
  const values = useAppStore((state) => state.settingsValues);
  const setActiveSettingsCategory = useAppStore((state) => state.setActiveSettingsCategory);
  const selectSetting = useAppStore((state) => state.selectSetting);
  const adjustSelectedSetting = useAppStore((state) => state.adjustSelectedSetting);
  const toggleSelectedSetting = useAppStore((state) => state.toggleSelectedSetting);

  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0];
  const selectedSetting = activeCategory.settings[selectedSettingIndex] ?? activeCategory.settings[0];
  const selectedValue = values[selectedSetting.key];

  return (
    <ScreenFrame title="SETTINGS" subtitle="Workstation setup">
      <div
        className="grid h-full gap-[12px]"
        style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}
      >
        <div className="grid min-h-0 grid-cols-[0.82fr_1.08fr_0.95fr] gap-[2.3%] overflow-hidden">
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">CATEGORY</p>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveSettingsCategory(category.id)}
                className={`border px-[4%] py-[3%] text-left ${
                  category.id === activeCategoryId
                    ? "border-amber-300 bg-amber-200/15 text-amber-100"
                    : "border-[#46533b] bg-black/15 text-[#d8e3b7]"
                }`}
              >
                {category.label}
              </button>
            ))}
          </section>

          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(9px,0.7vw,11px)] tracking-[0.16em] text-[#91a477]">
              {activeCategory.label}
            </div>
            <div className="grid content-start">
              {activeCategory.settings.map((setting, index) => (
                <button
                  key={setting.label}
                  type="button"
                  onClick={() => selectSetting(index)}
                  className={`grid grid-cols-[1fr_auto] px-[3%] py-[2.2%] text-left text-[clamp(9px,0.7vw,11px)] tracking-[0.12em] ${
                    index === selectedSettingIndex ? "bg-amber-200/15 text-amber-100" : "text-[#d8e3b7]"
                  }`}
                >
                  <span>{setting.label}</span>
                  <span>{formatSettingValue(values[setting.key], setting.key)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="SETTING" value={selectedSetting.label} />
            <Info label="CURRENT VALUE" value={formatSettingValue(selectedValue, selectedSetting.key)} />
            {selectedSetting.kind === "toggle" ? (
              <button
                type="button"
                onClick={toggleSelectedSetting}
                className="grid gap-[4%] border border-[#46533b] bg-black/15 px-[4%] py-[3%] text-left"
              >
                <span className="text-[#91a477]">TOGGLE</span>
                <span className="flex items-center gap-[8px] text-[#eef6d8]">
                  <span className={`h-[10px] w-[18px] border border-[#46533b] ${selectedValue ? "bg-[#d8e3b7]" : "bg-black/30"}`} />
                  {selectedValue ? "ON" : "OFF"}
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-[6px] border border-[#46533b] bg-black/15 px-[4%] py-[3%]">
                <span className="text-[#91a477]">ADJUST</span>
                <button type="button" onClick={() => adjustSelectedSetting(-1)} className="px-1 text-[#eef6d8]">
                  -
                </button>
                <span className="min-w-[72px] text-center text-[#eef6d8]">
                  {formatSettingValue(selectedValue, selectedSetting.key)}
                </span>
                <button type="button" onClick={() => adjustSelectedSetting(1)} className="px-1 text-[#eef6d8]">
                  +
                </button>
              </div>
            )}
            {selectedSetting.options && (
              <Info label="OPTIONS" value={selectedSetting.options.join(" / ")} />
            )}
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 MIDI") setActiveSettingsCategory("midi");
                if (button === "F2 AUDIO") setActiveSettingsCategory("audio");
                if (button === "F3 SYNC") setActiveSettingsCategory("sync");
                if (button === "F4 CLICK") setActiveSettingsCategory("metronome");
                if (button === "F5 SYSTEM") setActiveSettingsCategory("system");
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-[4%]">
      <span className="text-[#91a477]">{label}</span>
      <span className="text-[#eef6d8]">{value}</span>
    </div>
  );
}

function formatSettingValue(value: string | number | boolean, key?: string) {
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (key === "masterVolume" && typeof value === "number") return `${value}%`;
  return String(value);
}
