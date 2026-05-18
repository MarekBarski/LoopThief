import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";

const zoomSteps = [1, 2, 4, 8, 16];
type MarkerId = "sampleStart" | "sampleEnd" | "loopStart" | "loopEnd" | `slice:${number}`;

export function ChopScreen() {
  const recordedSamples = useAppStore((state) => state.recordedSamples);
  const chopSelectedSampleIndex = useAppStore((state) => state.chopSelectedSampleIndex);
  const selectedSlice = useAppStore((state) => state.selectedSlice);
  const chopCursor = useAppStore((state) => state.chopCursor);
  const waveformZoom = useAppStore((state) => state.waveformZoom);
  const waveformOffset = useAppStore((state) => state.waveformOffset);
  const chopEditMode = useAppStore((state) => state.chopEditMode);
  const chopSliceMode = useAppStore((state) => state.chopSliceMode);
  const autoSliceCount = useAppStore((state) => state.autoSliceCount);
  const selectedMarker = useAppStore((state) => state.selectedMarker);
  const sampleStart = useAppStore((state) => state.sampleStart);
  const sampleEnd = useAppStore((state) => state.sampleEnd);
  const loopEnabled = useAppStore((state) => state.loopEnabled);
  const loopStart = useAppStore((state) => state.loopStart);
  const loopEnd = useAppStore((state) => state.loopEnd);
  const loopBars = useAppStore((state) => state.loopBars);
  const sliceMarkers = useAppStore((state) => state.sliceMarkers);
  const normalizeEnabled = useAppStore((state) => state.normalizeEnabled);
  const selectedPad = useAppStore((state) => state.selectedPad);
  const padBank = useAppStore((state) => state.padBank);
  const selectedPadAssignment = useAppStore(
    (state) => state.padAssignments[state.padBank].find((pad) => pad.pad === state.selectedPad)?.assignment ?? "---",
  );
  const isPlaying = useAppStore((state) => state.isPlaying);
  const tickChopPlayback = useAppStore((state) => state.tickChopPlayback);
  const nextSlice = useAppStore((state) => state.nextSlice);
  const previousSlice = useAppStore((state) => state.previousSlice);
  const setSelectedMarker = useAppStore((state) => state.setSelectedMarker);
  const setChopEditMode = useAppStore((state) => state.setChopEditMode);
  const setChopSliceMode = useAppStore((state) => state.setChopSliceMode);
  const setAutoSliceCount = useAppStore((state) => state.setAutoSliceCount);
  const enableLoopMode = useAppStore((state) => state.enableLoopMode);
  const adjustLoopBars = useAppStore((state) => state.adjustLoopBars);
  const enterChopMode = useAppStore((state) => state.enterChopMode);
  const setWaveformZoom = useAppStore((state) => state.setWaveformZoom);
  const panWaveform = useAppStore((state) => state.panWaveform);
  const moveMarkerTo = useAppStore((state) => state.moveMarkerTo);
  const moveSelectedMarker = useAppStore((state) => state.moveSelectedMarker);
  const addSlice = useAppStore((state) => state.addSlice);
  const insertSliceAt = useAppStore((state) => state.insertSliceAt);
  const removeSlice = useAppStore((state) => state.removeSlice);
  const saveChopEdits = useAppStore((state) => state.saveChopEdits);
  const previewChopSlice = useAppStore((state) => state.previewChopSlice);
  const previousChopSample = useAppStore((state) => state.previousChopSample);
  const nextChopSample = useAppStore((state) => state.nextChopSample);
  const keepChops = useAppStore((state) => state.keepChops);
  const discardChopEdits = useAppStore((state) => state.discardChopEdits);
  const assignCurrentSliceToSelectedPad = useAppStore((state) => state.assignCurrentSliceToSelectedPad);

  const viewportRef = useRef<HTMLElement>(null);
  const baseNameInputRef = useRef<HTMLInputElement>(null);
  const [sliceCountDraft, setSliceCountDraft] = useState(String(autoSliceCount).padStart(2, "0"));
  const [showKeepPopup, setShowKeepPopup] = useState(false);
  const [baseName, setBaseName] = useState("");
  const [targetBank, setTargetBank] = useState<"A" | "B" | "C" | "D">("A");
  const [createProgram, setCreateProgram] = useState(true);
  const dragRef = useRef<
    | { type: "marker"; marker: MarkerId }
    | { type: "pan"; startX: number; startOffset: number }
    | null
  >(null);

  const sample = recordedSamples[chopSelectedSampleIndex] ?? recordedSamples.at(-1);
  const baseSamples = recordedSamples.filter((item) => !/_S\d{2}$/.test(item.name));
  const sampleOrdinal = Math.max(baseSamples.findIndex((item) => item === sample), 0) + 1;
  const chopStateLabel = sliceMarkers.length > 0 || sample?.editState?.sliceMarkers.length ? "CHOPPED" : "RAW";
  const waveform = sample?.waveform ?? [];
  const visibleLength = 1 / waveformZoom;
  const visibleEnd = waveformOffset + visibleLength;
  const selectedStart = sliceMarkers[selectedSlice - 1] ?? sampleStart;
  const selectedEnd = sliceMarkers[selectedSlice] ?? sampleEnd;
  const visibleWaveform = useMemo(
    () => createVisibleWaveformPoints(waveform, waveformOffset, visibleEnd),
    [waveform, waveformOffset, visibleEnd],
  );
  const loopLengthMs = sample ? Math.max(0, loopEnd - loopStart) * sample.durationMs : 0;
  const timeSignatureNumerator = 4;
  const loopBeats = loopBars * timeSignatureNumerator;
  const bpmEstimate = loopEnabled && loopLengthMs > 0 ? (60 * loopBeats) / (loopLengthMs / 1000) : null;

  useEffect(() => {
    setSliceCountDraft(String(autoSliceCount).padStart(2, "0"));
  }, [autoSliceCount]);

  useEffect(() => {
    if (!sample) return;
    setBaseName(sample.name);
  }, [sample]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => tickChopPlayback(0.01), 50);
    return () => window.clearInterval(interval);
  }, [isPlaying, tickChopPlayback]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const viewport = viewportRef.current;
      if (!drag || !viewport) return;
      const rect = viewport.getBoundingClientRect();
      if (drag.type === "marker") {
        const normalized = clamp01(waveformOffset + ((event.clientX - rect.left) / rect.width) * visibleLength);
        moveMarkerTo(drag.marker, normalized);
        return;
      }
      const delta = ((drag.startX - event.clientX) / rect.width) * visibleLength;
      panWaveform(drag.startOffset + delta - waveformOffset);
    };

    const onPointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [moveMarkerTo, panWaveform, visibleLength, waveformOffset]);

  useEffect(() => {
    if (chopEditMode !== "CHOP" || chopSliceMode !== "MANUAL") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      if (event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      removeSlice();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chopEditMode, chopSliceMode, removeSlice]);

  const beginMarkerDrag = (marker: MarkerId) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedMarker(marker);
    dragRef.current = { type: "marker", marker };
  };

  const beginPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { type: "pan", startX: event.clientX, startOffset: waveformOffset };
  };

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault();
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
      panWaveform((event.deltaX || event.deltaY) / 600 / waveformZoom);
      return;
    }
    const nextZoom = event.deltaY < 0 ? nextZoomStep(waveformZoom) : previousZoomStep(waveformZoom);
    setWaveformZoom(nextZoom);
  };

  const insertSliceFromWaveform = (event: ReactMouseEvent<HTMLElement>) => {
    if (chopEditMode !== "CHOP" || chopSliceMode !== "MANUAL" || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = clamp01(waveformOffset + ((event.clientX - rect.left) / rect.width) * visibleLength);
    insertSliceAt(position);
  };

  const commitSliceCount = () => {
    const parsed = Number(sliceCountDraft);
    setAutoSliceCount(Number.isFinite(parsed) ? parsed : autoSliceCount);
  };

  return (
    <ScreenFrame title="CHOP" subtitle="Sample edit">
      <div className="grid h-full min-h-0 gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
        <div className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-[10px] overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-[3%] border border-[#46533b] bg-black/20 px-[2.5%] py-[1.7%] text-[clamp(10px,0.82vw,13px)] tracking-[0.14em]">
          <div className="grid grid-cols-4 gap-[3%]">
            <div className="grid gap-[4%]">
              <span className="text-[#91a477]">SAMPLE</span>
              <span className="flex items-center gap-[6px] text-[#eef6d8]">
                <button type="button" onClick={previousChopSample} className="text-[#91a477]">
                  &lt;
                </button>
                <span className="truncate">{sample?.name ?? "NO SAMPLE"}</span>
                <button type="button" onClick={nextChopSample} className="text-[#91a477]">
                  &gt;
                </button>
              </span>
            </div>
            <Info label="INDEX" value={baseSamples.length > 0 ? `[${sampleOrdinal} / ${baseSamples.length}]` : "[0 / 0]"} />
            <Info label="LENGTH" value={sample ? formatMs(sample.durationMs) : "--:--.---"} />
            <Info label="MODE" value={chopEditMode} />
          </div>
          <div className="grid grid-cols-4 gap-[16px]">
            <Info label="STATE" value={chopStateLabel} />
            <Info label="ZOOM" value={`${waveformZoom.toFixed(0)}X`} />
            <Info label="START" value={formatPercent(sampleStart)} />
            <Info label="END" value={formatPercent(sampleEnd)} />
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_190px] gap-[2.5%] overflow-hidden">
          <section
            ref={viewportRef}
            onPointerDown={beginPan}
            onClick={insertSliceFromWaveform}
            onWheel={handleWheel}
            className="relative min-h-0 overflow-hidden border border-[#46533b] bg-black/25"
          >
            {waveform.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[clamp(10px,0.8vw,13px)] tracking-[0.18em] text-[#91a477]">
                RECORD A SAMPLE TO BEGIN CHOPPING
              </div>
            ) : (
              <>
                <WaveformShape points={visibleWaveform} />

                <RegionBand start={sampleStart} end={sampleEnd} offset={waveformOffset} length={visibleLength} />
                {loopEnabled && <RegionBand start={loopStart} end={loopEnd} offset={waveformOffset} length={visibleLength} loop />}

                {isWithinView(chopCursor, waveformOffset, visibleEnd) && (
                  <div
                    className="absolute inset-y-[4%] w-[2px] bg-[#eef6d8] shadow-[0_0_8px_rgba(238,246,216,0.55)]"
                    style={{ left: `${toViewportPercent(chopCursor, waveformOffset, visibleLength)}%` }}
                  />
                )}

                <Marker
                  label="S"
                  marker="sampleStart"
                  value={sampleStart}
                  offset={waveformOffset}
                  length={visibleLength}
                  selected={selectedMarker === "sampleStart"}
                  onPointerDown={beginMarkerDrag("sampleStart")}
                />
                <Marker
                  label="E"
                  marker="sampleEnd"
                  value={sampleEnd}
                  offset={waveformOffset}
                  length={visibleLength}
                  selected={selectedMarker === "sampleEnd"}
                  onPointerDown={beginMarkerDrag("sampleEnd")}
                />
                {loopEnabled && (
                  <>
                    <Marker
                      label="L"
                      marker="loopStart"
                      value={loopStart}
                      offset={waveformOffset}
                      length={visibleLength}
                      selected={selectedMarker === "loopStart"}
                      onPointerDown={beginMarkerDrag("loopStart")}
                    />
                    <Marker
                      label="R"
                      marker="loopEnd"
                      value={loopEnd}
                      offset={waveformOffset}
                      length={visibleLength}
                      selected={selectedMarker === "loopEnd"}
                      onPointerDown={beginMarkerDrag("loopEnd")}
                    />
                  </>
                )}

                {chopEditMode === "CHOP" && sliceMarkers.map((marker, index) => (
                  <Marker
                    key={`${marker}-${index}`}
                    label={String(index + 1).padStart(2, "0")}
                    marker={`slice:${index}`}
                    value={marker}
                    offset={waveformOffset}
                    length={visibleLength}
                    selected={selectedMarker === `slice:${index}` || selectedSlice === index + 1}
                    onPointerDown={(event) => {
                      previewChopSlice(index);
                      beginMarkerDrag(`slice:${index}`)(event);
                    }}
                    slice
                  />
                ))}

                <div className="absolute inset-x-[2.5%] bottom-[3%] flex justify-between text-[clamp(8px,0.68vw,10px)] tracking-[0.18em] text-[#91a477]">
                  <span>{formatPercent(waveformOffset)}</span>
                  <span>{formatPercent(waveformOffset + visibleLength * 0.25)}</span>
                  <span>{formatPercent(waveformOffset + visibleLength * 0.5)}</span>
                  <span>{formatPercent(waveformOffset + visibleLength * 0.75)}</span>
                  <span>{formatPercent(visibleEnd)}</span>
                </div>
              </>
            )}
          </section>

          <aside className="grid min-h-0 content-start gap-[8px] overflow-hidden border border-[#46533b] bg-black/20 p-[10px] text-[clamp(9px,0.72vw,11px)] tracking-[0.12em]">
            <Info label="SELECTED" value={formatSelectedMarker(selectedMarker)} />
            {chopEditMode === "TRIM" && (
              <>
                <Info label="TRIM START" value={formatPercent(sampleStart)} />
                <Info label="TRIM END" value={formatPercent(sampleEnd)} />
              </>
            )}
            {chopEditMode === "LOOP" && (
              <>
                <Info label="LOOP" value={`${formatPercent(loopStart)} → ${formatPercent(loopEnd)}`} />
                <Info label="LOOP BARS" value={String(loopBars)} />
                <Info label="LOOP BPM EST" value={bpmEstimate ? bpmEstimate.toFixed(2) : "--.--"} />
              </>
            )}
            {chopEditMode === "CHOP" && (
              <>
                <Info label="CHOP MODE" value={chopSliceMode} />
                <Info label="SLICE" value={`${formatPercent(selectedStart)} → ${formatPercent(selectedEnd)}`} />
                <SliceCountField
                  value={sliceCountDraft}
                  actualCount={sliceMarkers.length}
                  onChange={setSliceCountDraft}
                  onCommit={commitSliceCount}
                />
              </>
            )}
            <Info label="TARGET PAD" value={`${padBank}:${selectedPad}`} />
            <Info label="ASSIGNED" value={selectedPadAssignment} />
            <Info label="NORMALIZE" value={normalizeEnabled ? "ON" : "OFF"} />
            <div className="grid grid-cols-2 gap-[8px]">
              {chopEditMode === "CHOP" && <MiniButton label="PREV" onClick={previousSlice} />}
              {chopEditMode === "CHOP" && <MiniButton label="NEXT" onClick={nextSlice} />}
              <MiniButton label="MARK -" onClick={() => moveSelectedMarker(-0.0025)} />
              <MiniButton label="MARK +" onClick={() => moveSelectedMarker(0.0025)} />
              <MiniButton label="ZOOM -" onClick={() => setWaveformZoom(previousZoomStep(waveformZoom))} />
              <MiniButton label="ZOOM +" onClick={() => setWaveformZoom(nextZoomStep(waveformZoom))} />
              {chopEditMode === "LOOP" && <MiniButton label="BARS -" onClick={() => adjustLoopBars(-1)} />}
              {chopEditMode === "LOOP" && <MiniButton label="BARS +" onClick={() => adjustLoopBars(1)} />}
            </div>
          </aside>
        </div>

        {showKeepPopup && (
          <KeepChopsPopup
            baseName={baseName}
            sliceCount={sliceMarkers.length}
            targetBank={targetBank}
            createProgram={createProgram}
            inputRef={baseNameInputRef}
            onBaseNameChange={setBaseName}
          />
        )}
        </div>

        {showKeepPopup ? (
          <div className="grid grid-cols-6 gap-[1.4%]">
            <Softkey label="F1 NAME" onClick={() => baseNameInputRef.current?.focus()} />
            <Softkey label="F2 BANK" onClick={() => setTargetBank(nextBank(targetBank))} />
            <Softkey label="F3 PROGRAM" onClick={() => setCreateProgram((value) => !value)} />
            <Softkey
              label="F4 DISCARD"
              onClick={() => {
                discardChopEdits();
                setShowKeepPopup(false);
              }}
            />
            <Softkey
              label="F5 KEEP"
              onClick={() => {
                keepChops({ baseName: baseName.trim() || sample?.name || "SAMPLE_001", targetBank, createProgram });
                setShowKeepPopup(false);
              }}
            />
            <Softkey label="F6 CANCEL" onClick={() => setShowKeepPopup(false)} />
          </div>
        ) : chopEditMode === "CHOP" ? (
          <div className="grid grid-cols-6 gap-[1.4%]">
            <Softkey label="F1 AUTO" onClick={() => setChopSliceMode("AUTO")} />
            <Softkey label="F2 MANUAL" onClick={() => setChopSliceMode("MANUAL")} />
            <Softkey label="F3 ADD" onClick={addSlice} />
            <Softkey label="F4 DELETE" onClick={removeSlice} />
            <Softkey label="F5 ASSIGN" onClick={assignCurrentSliceToSelectedPad} />
            <Softkey label="F6 DONE" onClick={() => setShowKeepPopup(true)} />
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-[1.4%]">
            <Softkey label="F1 START" onClick={() => { setChopEditMode("TRIM"); setSelectedMarker("sampleStart"); }} />
            <Softkey label="F2 END" onClick={() => { setChopEditMode("TRIM"); setSelectedMarker("sampleEnd"); }} />
            <Softkey label="F3 LOOP" onClick={() => { enableLoopMode(); setSelectedMarker(selectedMarker === "loopStart" ? "loopEnd" : "loopStart"); }} />
            <Softkey label="F4 CHOP" onClick={enterChopMode} />
            <Softkey label="F5 ZOOM" onClick={() => setWaveformZoom(cycleZoomStep(waveformZoom))} />
            <Softkey label="F6 SAVE" onClick={saveChopEdits} />
          </div>
        )}
      </div>
    </ScreenFrame>
  );
}

function Marker({
  label,
  marker,
  value,
  offset,
  length,
  selected,
  slice = false,
  onPointerDown,
}: {
  label: string;
  marker: MarkerId;
  value: number;
  offset: number;
  length: number;
  selected: boolean;
  slice?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  if (!isWithinView(value, offset, offset + length)) return null;
  return (
    <button
      type="button"
      aria-label={marker}
      onPointerDown={onPointerDown}
      className="absolute inset-y-0 z-10 w-[12px] -translate-x-1/2 cursor-ew-resize"
      style={{ left: `${toVisibleMarkerPercent(value, offset, length)}%` }}
    >
      <span
        className={`mx-auto block h-full w-[2px] ${
          selected ? "bg-amber-300" : slice ? "bg-[#7f9560]" : "bg-[#a7c878]"
        }`}
      />
      <span
        className={`absolute left-2 top-[4%] whitespace-nowrap text-[clamp(8px,0.68vw,10px)] tracking-[0.14em] ${
          selected ? "text-amber-200" : "text-[#9cab84]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function RegionBand({
  start,
  end,
  offset,
  length,
  loop = false,
}: {
  start: number;
  end: number;
  offset: number;
  length: number;
  loop?: boolean;
}) {
  const visibleStart = Math.max(start, offset);
  const visibleEnd = Math.min(end, offset + length);
  if (visibleEnd <= visibleStart) return null;
  return (
    <div
      className={`absolute inset-y-[9%] ${loop ? "bg-amber-200/10" : "bg-[#d8e3b7]/5"}`}
      style={{
        left: `${toViewportPercent(visibleStart, offset, length)}%`,
        width: `${((visibleEnd - visibleStart) / length) * 100}%`,
      }}
    />
  );
}

function WaveformShape({ points }: { points: number[] }) {
  const topPath = createWaveformPath(points, false);
  const bottomPath = createWaveformPath(points, true);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-[5%_2.5%_11%] h-auto w-auto"
    >
      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(216,227,183,0.35)" strokeWidth="0.8" />
      <path d={topPath} fill="none" stroke="#d8e3b7" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
      <path d={bottomPath} fill="none" stroke="#d8e3b7" strokeWidth="1.3" vectorEffect="non-scaling-stroke" opacity="0.82" />
    </svg>
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

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[#46533b] bg-black/25 px-2 py-2 text-center text-[clamp(8px,0.66vw,10px)] font-semibold tracking-[0.14em] text-[#d8e3b7]"
    >
      {label}
    </button>
  );
}

function SliceCountField({
  value,
  actualCount,
  onChange,
  onCommit,
}: {
  value: string;
  actualCount: number;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="grid gap-[4%]">
      <span className="text-[#91a477]">SLICES</span>
      <span className="flex items-center gap-[6px]">
        <input
          value={value}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
              event.currentTarget.blur();
            }
          }}
          className="w-[42px] border border-[#46533b] bg-black/35 px-[5px] py-[2px] text-[#eef6d8] outline-none focus:border-amber-300"
        />
        <span className="text-[#91a477]">ACT {String(actualCount).padStart(2, "0")}</span>
      </span>
    </label>
  );
}

function Softkey({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-[#46533b] bg-black/25 px-[3%] py-[7%] text-center text-[clamp(8px,0.7vw,11px)] font-semibold tracking-[0.14em] text-[#d8e3b7]"
    >
      {label}
    </button>
  );
}

function KeepChopsPopup({
  baseName,
  sliceCount,
  targetBank,
  createProgram,
  inputRef,
  onBaseNameChange,
}: {
  baseName: string;
  sliceCount: number;
  targetBank: "A" | "B" | "C" | "D";
  createProgram: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onBaseNameChange: (value: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/45 p-[5%]">
      <section className="w-[min(420px,72%)] border border-[#91a477] bg-[#0a0d08] p-[18px] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em] shadow-[0_0_18px_rgba(0,0,0,0.55)]">
        <p className="mb-[14px] text-[#eef6d8]">KEEP CHOPS?</p>
        <div className="grid gap-[10px]">
          <label className="grid grid-cols-[1fr_1.1fr] items-center gap-[12px]">
            <span className="text-[#91a477]">BASE NAME</span>
            <input
              ref={inputRef}
              value={baseName}
              onChange={(event) => onBaseNameChange(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="border border-[#46533b] bg-black/35 px-[8px] py-[4px] text-[#eef6d8] outline-none focus:border-amber-300"
            />
          </label>
          <PopupRow label="SLICE COUNT" value={String(sliceCount).padStart(2, "0")} />
          <PopupRow label="TARGET BANK" value={targetBank} />
          <PopupRow label="CREATE PROGRAM" value={createProgram ? "ON" : "OFF"} />
        </div>
      </section>
    </div>
  );
}

function PopupRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_1.1fr] gap-[12px]">
      <span className="text-[#91a477]">{label}</span>
      <span className="text-[#eef6d8]">{value}</span>
    </div>
  );
}

function createVisibleWaveformPoints(waveform: number[], start: number, end: number) {
  if (waveform.length === 0) return [];
  const pointCount = 128;
  return Array.from({ length: pointCount }, (_, index) => {
    const position = start + (index / (pointCount - 1)) * (end - start);
    const waveformIndex = Math.min(waveform.length - 1, Math.floor(position * waveform.length));
    return waveform[waveformIndex] ?? 0;
  });
}

function nextZoomStep(current: number) {
  return zoomSteps.find((step) => step > current) ?? zoomSteps.at(-1)!;
}

function previousZoomStep(current: number) {
  return [...zoomSteps].reverse().find((step) => step < current) ?? zoomSteps[0];
}

function cycleZoomStep(current: number) {
  const currentIndex = zoomSteps.indexOf(current);
  return zoomSteps[(currentIndex + 1) % zoomSteps.length] ?? zoomSteps[0];
}

function toViewportPercent(value: number, offset: number, length: number) {
  return ((value - offset) / length) * 100;
}

function toVisibleMarkerPercent(value: number, offset: number, length: number) {
  return Math.min(Math.max(toViewportPercent(value, offset, length), 0.5), 99.5);
}

function isWithinView(value: number, start: number, end: number) {
  return value >= start && value <= end;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function formatSelectedMarker(marker: MarkerId | null) {
  if (!marker) return "---";
  if (marker.startsWith("slice:")) return `SLICE ${String(Number(marker.split(":")[1]) + 1).padStart(2, "0")}`;
  return marker.replace(/([A-Z])/g, " $1").toUpperCase();
}

function createWaveformPath(points: number[], mirrored: boolean) {
  if (points.length === 0) return "";
  return points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const amplitude = value * 38;
      const y = mirrored ? 50 + amplitude : 50 - amplitude;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function nextBank(bank: "A" | "B" | "C" | "D") {
  const banks = ["A", "B", "C", "D"] as const;
  return banks[(banks.indexOf(bank) + 1) % banks.length];
}

function formatMs(value: number) {
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(value % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
