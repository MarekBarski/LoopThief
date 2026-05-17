import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const softButtons = ["F1 LOAD", "F2 SAVE", "F3 RENAME", "F4 DELETE", "F5 EXPORT", "F6 NEW FOLDER"];

export function DiskScreen() {
  const diskFolders = useAppStore((state) => state.diskFolders);
  const activeDiskFolderId = useAppStore((state) => state.activeDiskFolderId);
  const selectedDiskItemIndex = useAppStore((state) => state.selectedDiskItemIndex);
  const openDiskFolder = useAppStore((state) => state.openDiskFolder);
  const selectDiskItem = useAppStore((state) => state.selectDiskItem);
  const loadSelectedDiskItem = useAppStore((state) => state.loadSelectedDiskItem);
  const saveDiskItem = useAppStore((state) => state.saveDiskItem);

  const activeFolder = diskFolders.find((folder) => folder.id === activeDiskFolderId) ?? diskFolders[0];
  const selectedItem = activeFolder.items[selectedDiskItemIndex] ?? activeFolder.items[0];

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
          </section>

          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="grid grid-cols-[1fr_0.72fr_0.72fr] border-b border-[#46533b] px-[3%] py-[2%] text-[clamp(9px,0.7vw,11px)] tracking-[0.16em] text-[#91a477]">
              <span>NAME</span>
              <span>TYPE</span>
              <span>SIZE</span>
            </div>
            <div className="grid content-start">
              {activeFolder.items.map((item, index) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => selectDiskItem(index)}
                  className={`grid grid-cols-[1fr_0.72fr_0.72fr] px-[3%] py-[2%] text-left text-[clamp(9px,0.7vw,11px)] tracking-[0.12em] ${
                    index === selectedDiskItemIndex
                      ? "bg-amber-200/15 text-amber-100"
                      : "text-[#d8e3b7]"
                  }`}
                >
                  <span>{item.name}</span>
                  <span>{item.type}</span>
                  <span>{item.size}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <Info label="SELECTED" value={selectedItem.name} />
            <Info label="TYPE" value={selectedItem.type} />
            <Info label="SIZE" value={selectedItem.size} />
            <Info label="MODIFIED" value={selectedItem.modified} />
            <Info label="ASSIGNED PGM" value={selectedItem.assignedProgram} />
            <Info label="USED PADS" value={selectedItem.usedPads} />
            <Info label="SAMPLE LEN" value={selectedItem.sampleLength} />
          </section>
        </div>

        <div className="grid grid-cols-6 gap-[1.4%]">
          {softButtons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === "F1 LOAD") loadSelectedDiskItem();
                if (button === "F2 SAVE") saveDiskItem();
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
