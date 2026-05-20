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
import { getSampleAudioRef } from "../audio/sampleLibrary";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { useHoldRepeat } from "../components/useHoldRepeat";

const zoomSteps = [1, 2, 4, 8, 16];
type MarkerId = "sampleStart" | "sampleEnd" | "loopStart" | "loopEnd" | `slice:${number}`;
type WaveformColumn = { min: number; max: number };

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
  const chopPreviewActive = useAppStore((state) => state.chopPreviewActive);
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
  const prevSampleHold = useHoldRepeat(previousChopSample);
  const nextSampleHold = useHoldRepeat(nextChopSample);
  const keepChops = useAppStore((state) => state.keepChops);
  const discardChopEdits = useAppStore((state) => state.discardChopEdits);
  const assignCurrentSliceToSelectedPad = useAppStore((state) => state.assignCurrentSliceToSelectedPad);

  const waveformRectRef = useRef<HTMLDivElement>(null);
  const baseNameInputRef = useRef<HTMLInputElement>(null);
  const [sliceCountDraft, setSliceCountDraft] = useState(String(autoSliceCount).padStart(2, "0"));
  const [waveformViewportWidth, setWaveformViewportWidth] = useState(512);
  const [waveformViewportHeight, setWaveformViewportHeight] = useState(180);
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
  const activeStart = sample?.editState?.sampleStart ?? 0;
  const activeEnd = sample?.editState?.sampleEnd ?? 1;
  const activeLength = Math.max(0.0001, activeEnd - activeStart);
  const visibleLength = 1 / waveformZoom;
  const visibleEnd = Math.min(1, waveformOffset + visibleLength);
  const visibleOriginalStart = activeToOriginalPosition(waveformOffset, activeStart, activeLength);
  const visibleOriginalEnd = activeToOriginalPosition(visibleEnd, activeStart, activeLength);
  const visibleOriginalLength = Math.max(0.0001, visibleOriginalEnd - visibleOriginalStart);
  const selectedStart = sliceMarkers[selectedSlice - 1] ?? sampleStart;
  const selectedEnd = sliceMarkers[selectedSlice] ?? sampleEnd;
  const visibleWaveform = useMemo(
    () =>
      createVisibleWaveformColumns({
        audioBufferId: sample?.audioBufferId,
        fallbackWaveform: waveform,
        start: visibleOriginalStart,
        end: visibleOriginalEnd,
        columnCount: waveformViewportWidth,
      }),
    [sample?.audioBufferId, visibleOriginalEnd, visibleOriginalStart, waveform, waveformViewportWidth],
  );
  const loopLengthMs = sample ? Math.max(0, loopEnd - loopStart) * sample.durationMs : 0;
  const timeSignatureNumerator = 4;
  const loopBeats = loopBars * timeSignatureNumerator;
  const rawBpmEstimate = loopEnabled && loopLengthMs > 0 ? (60 * loopBeats) / (loopLengthMs / 1000) : null;
  const bpmEstimate = rawBpmEstimate !== null && rawBpmEstimate >= 40 && rawBpmEstimate <= 1000 ? rawBpmEstimate : null;

  useEffect(() => {
    const displayedCount = chopSliceMode === "MANUAL" ? sliceMarkers.length : autoSliceCount;
    setSliceCountDraft(String(displayedCount).padStart(2, "0"));
  }, [autoSliceCount, chopSliceMode, sliceMarkers.length]);

  useEffect(() => {
    if (!sample) return;
    setBaseName(sample.name);
  }, [sample]);

  useEffect(() => {
    const waveformRect = waveformRectRef.current;
    if (!waveformRect) return;
    const updateSize = () => {
      const rect = waveformRect.getBoundingClientRect();
      setWaveformViewportWidth(Math.max(128, Math.round(rect.width)));
      setWaveformViewportHeight(Math.max(48, Math.round(rect.height)));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(waveformRect);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chopPreviewActive) return;
    const interval = window.setInterval(tickChopPlayback, 33);
    return () => window.clearInterval(interval);
  }, [chopPreviewActive, tickChopPlayback]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const waveformRect = waveformRectRef.current;
      if (!drag || !waveformRect) return;
      const rect = waveformRect.getBoundingClientRect();
      if (drag.type === "marker") {
        const viewportPosition = clamp01(waveformOffset + ((event.clientX - rect.left) / rect.width) * visibleLength);
        moveMarkerTo(drag.marker, activeToOriginalPosition(viewportPosition, activeStart, activeLength));
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
  }, [activeLength, activeStart, moveMarkerTo, panWaveform, visibleLength, waveformOffset]);

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
    const viewportPosition = clamp01(waveformOffset + ((event.clientX - rect.left) / rect.width) * visibleLength);
    const position = activeToOriginalPosition(viewportPosition, activeStart, activeLength);
    insertSliceAt(position);
  };

  const commitSliceCount = () => {
    if (chopSliceMode === "MANUAL") {
      setSliceCountDraft(String(sliceMarkers.length).padStart(2, "0"));
      return;
    }
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
                <button type="button" {...prevSampleHold} className="text-[#91a477]">
                  &lt;
                </button>
                <span className="truncate">{sample?.name ?? "NO SAMPLE"}</span>
                <button type="button" {...nextSampleHold} className="text-[#91a477]">
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
            <Info label="START" value={formatPercent(originalToActivePosition(sampleStart, activeStart, activeLength))} />
            <Info label="END" value={formatPercent(originalToActivePosition(sampleEnd, activeStart, activeLength))} />
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_190px] gap-[2.5%] overflow-hidden">
          <section
            onWheel={handleWheel}
            className="relative min-h-0 overflow-hidden border border-[#46533b] bg-black/25"
          >
            {waveform.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[clamp(10px,0.8vw,13px)] tracking-[0.18em] text-[#91a477]">
                RECORD A SAMPLE TO BEGIN CHOPPING
              </div>
            ) : (
              <>
                <div
                  ref={waveformRectRef}
                  onPointerDown={beginPan}
                  onClick={insertSliceFromWaveform}
                  className="absolute bottom-[11%] left-[2.5%] right-[2.5%] top-[5%]"
                >
                  <WaveformShape columns={visibleWaveform} width={waveformViewportWidth} height={waveformViewportHeight} />

                  <RegionBand start={sampleStart} end={sampleEnd} offset={visibleOriginalStart} length={visibleOriginalLength} />
                  {loopEnabled && <RegionBand start={loopStart} end={loopEnd} offset={visibleOriginalStart} length={visibleOriginalLength} loop />}

                  {chopPreviewActive && isWithinView(chopCursor, visibleOriginalStart, visibleOriginalEnd) && (
                    <div
                      className="absolute inset-y-0 w-[2px] bg-[#eef6d8] shadow-[0_0_8px_rgba(238,246,216,0.55)]"
                      style={{ left: `${toViewportPercent(chopCursor, visibleOriginalStart, visibleOriginalLength)}%` }}
                    />
                  )}

                  <Marker
                    label="S"
                    marker="sampleStart"
                    value={sampleStart}
                    offset={visibleOriginalStart}
                    length={visibleOriginalLength}
                    selected={selectedMarker === "sampleStart"}
                    onPointerDown={beginMarkerDrag("sampleStart")}
                  />
                  <Marker
                    label="E"
                    marker="sampleEnd"
                    value={sampleEnd}
                    offset={visibleOriginalStart}
                    length={visibleOriginalLength}
                    selected={selectedMarker === "sampleEnd"}
                    onPointerDown={beginMarkerDrag("sampleEnd")}
                  />
                  {loopEnabled && (
                    <>
                      <Marker
                        label="L"
                        marker="loopStart"
                        value={loopStart}
                        offset={visibleOriginalStart}
                        length={visibleOriginalLength}
                        selected={selectedMarker === "loopStart"}
                        onPointerDown={beginMarkerDrag("loopStart")}
                      />
                      <Marker
                        label="R"
                        marker="loopEnd"
                        value={loopEnd}
                        offset={visibleOriginalStart}
                        length={visibleOriginalLength}
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
                      offset={visibleOriginalStart}
                      length={visibleOriginalLength}
                      selected={selectedMarker === `slice:${index}` || selectedSlice === index + 1}
                      onPointerDown={(event) => {
                        previewChopSlice(index);
                        beginMarkerDrag(`slice:${index}`)(event);
                      }}
                      slice
                    />
                  ))}
                </div>

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
                <Info label="TRIM START" value={formatPercent(originalToActivePosition(sampleStart, activeStart, activeLength))} />
                <Info label="TRIM END" value={formatPercent(originalToActivePosition(sampleEnd, activeStart, activeLength))} />
              </>
            )}
            {chopEditMode === "LOOP" && (
              <>
                <Info
                  label="LOOP"
                  value={`${formatPercent(originalToActivePosition(loopStart, activeStart, activeLength))} → ${formatPercent(originalToActivePosition(loopEnd, activeStart, activeLength))}`}
                />
                <Info label="LOOP BARS" value={String(loopBars)} />
                <Info label="LOOP BPM EST" value={bpmEstimate ? bpmEstimate.toFixed(2) : "--.--"} />
              </>
            )}
            {chopEditMode === "CHOP" && (
              <>
                <Info label="CHOP MODE" value={chopSliceMode} />
                <Info
                  label="SLICE"
                  value={`${formatPercent(originalToActivePosition(selectedStart, activeStart, activeLength))} → ${formatPercent(originalToActivePosition(selectedEnd, activeStart, activeLength))}`}
                />
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

function WaveformShape({ columns, width, height }: { columns: WaveformColumn[]; width: number; height: number }) {
  const centerY = height / 2;
  const amplitudeScale = height * 0.45;
  const maxVisibleAmplitude = columns.reduce(
    (maximum, column) => Math.max(maximum, Math.abs(column.min), Math.abs(column.max)),
    0,
  );
  const visualGain = maxVisibleAmplitude > 0 ? Math.min(1 / maxVisibleAmplitude, 12) : 1;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <line x1="0" y1={centerY} x2={width} y2={centerY} stroke="rgba(216,227,183,0.35)" strokeWidth="0.8" />
      {columns.map((column, index) => {
        const x = columns.length <= 1 ? 0 : (index / (columns.length - 1)) * width;
        const yMax = centerY - clamp(column.max * visualGain, -1, 1) * amplitudeScale;
        const yMin = centerY - clamp(column.min * visualGain, -1, 1) * amplitudeScale;
        return (
          <line
            key={index}
            x1={x}
            x2={x}
            y1={Math.min(yMax, yMin)}
            y2={Math.max(yMax, yMin)}
            stroke="#d8e3b7"
            strokeWidth="0.75"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
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

function createVisibleWaveformColumns({
  audioBufferId,
  fallbackWaveform,
  start,
  end,
  columnCount,
}: {
  audioBufferId?: string;
  fallbackWaveform: number[];
  start: number;
  end: number;
  columnCount: number;
}): WaveformColumn[] {
  const columns = clamp(Math.round(columnCount), 128, 1200);
  const audioRef = audioBufferId ? getSampleAudioRef(audioBufferId) : null;
  if (!audioRef) return createFallbackWaveformColumns(fallbackWaveform, start, end, columns);

  const sampleLength = audioRef.buffer.length;
  const startFrame = clamp(Math.floor(start * sampleLength), 0, Math.max(0, sampleLength - 1));
  const endFrame = clamp(Math.ceil(end * sampleLength), startFrame + 1, sampleLength);
  const visibleFrames = Math.max(1, endFrame - startFrame);

  return Array.from({ length: columns }, (_, columnIndex) => {
    const windowStart = startFrame + Math.floor((columnIndex / columns) * visibleFrames);
    const windowEnd =
      columnIndex === columns - 1
        ? endFrame
        : startFrame + Math.max(1, Math.floor(((columnIndex + 1) / columns) * visibleFrames));
    let min = 1;
    let max = -1;

    for (const channel of audioRef.channels) {
      for (let frame = windowStart; frame < windowEnd; frame += 1) {
        const value = channel[frame] ?? 0;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    if (min === 1 && max === -1) return { min: 0, max: 0 };
    return { min, max };
  });
}

function createFallbackWaveformColumns(waveform: number[], start: number, end: number, columnCount: number): WaveformColumn[] {
  if (waveform.length === 0) return [];
  return Array.from({ length: columnCount }, (_, index) => {
    const position = start + (index / Math.max(1, columnCount - 1)) * (end - start);
    const waveformIndex = Math.min(waveform.length - 1, Math.floor(position * waveform.length));
    const peak = waveform[waveformIndex] ?? 0;
    return { min: -peak, max: peak };
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function activeToOriginalPosition(position: number, activeStart: number, activeLength: number) {
  return activeStart + clamp01(position) * activeLength;
}

function originalToActivePosition(position: number, activeStart: number, activeLength: number) {
  return clamp01((position - activeStart) / activeLength);
}

function formatSelectedMarker(marker: MarkerId | null) {
  if (!marker) return "---";
  if (marker.startsWith("slice:")) return `SLICE ${String(Number(marker.split(":")[1]) + 1).padStart(2, "0")}`;
  return marker.replace(/([A-Z])/g, " $1").toUpperCase();
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
