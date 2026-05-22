import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { ScreenFrame } from "./ScreenFrame";
import { lcdContentHeight, lcdSoftkeyHeight } from "./lcdLayout";
import { useHoldRepeat } from "../components/useHoldRepeat";
import { EditableNumber } from "../components/EditableNumber";
import type { ReactNode } from "react";

const shell = (children: ReactNode, softkeys: Softkey[], onExit?: () => void) => (
  <div className="grid h-full gap-[12px]" style={{ gridTemplateRows: `${lcdContentHeight} ${lcdSoftkeyHeight}px` }}>
    <div className="min-h-0 overflow-hidden">{children}</div>
    <Softkeys labels={softkeys} onExit={onExit} />
  </div>
);

export function SixteenLevelsScreen() {
  const sourcePad = useAppStore((s) => s.sixteenLevelsSourcePad);
  const parameter = useAppStore((s) => s.sixteenLevelsParameter);
  const rootPad = useAppStore((s) => s.sixteenLevelsRootPad);
  const sandboxCutoff = useAppStore((s) => s.sixteenLevelsFilterCutoff);
  const sandboxResonance = useAppStore((s) => s.sixteenLevelsFilterResonance);
  const sandboxType = useAppStore((s) => s.sixteenLevelsFilterType);
  const padAssignments = useAppStore((s) => s.padAssignments);
  const programs = useAppStore((s) => s.programs);
  const currentProgramId = useAppStore((s) => s.currentProgramId);
  const sourceArmed = useAppStore((s) => s.sixteenLevelsSourceArmed);
  const armSixteenLevelsSource = useAppStore((s) => s.armSixteenLevelsSource);
  const setSixteenLevelsSourceFromPad = useAppStore((s) => s.setSixteenLevelsSourceFromPad);
  const cycleSixteenLevelsParameter = useAppStore((s) => s.cycleSixteenLevelsParameter);
  const cycleSixteenLevelsRootPad = useAppStore((s) => s.cycleSixteenLevelsRootPad);
  const adjustSixteenLevelsFilterCutoff = useAppStore((s) => s.adjustSixteenLevelsFilterCutoff);
  const adjustSixteenLevelsFilterResonance = useAppStore((s) => s.adjustSixteenLevelsFilterResonance);
  const cycleSixteenLevelsFilterType = useAppStore((s) => s.cycleSixteenLevelsFilterType);
  const triggerPad = useAppStore((s) => s.triggerPad);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  const sourceBank = sourcePad.slice(0, 1) as "A" | "B" | "C" | "D";
  const sourceNumber = Number(sourcePad.slice(1)) || 1;
  const sourcePadId = `P${String(sourceNumber).padStart(2, "0")}`;
  const activeProgram = programs.find((p) => p.id === currentProgramId);
  const sourceAssignments = activeProgram?.padAssignments ?? padAssignments;
  const sourceAssignment = sourceAssignments[sourceBank]?.find((item) => item.pad === sourcePadId);
  const effectiveCutoff = sandboxCutoff ?? sourceAssignment?.filterCutoff ?? 50;
  const effectiveResonance = sandboxResonance ?? sourceAssignment?.filterResonance ?? 0;
  const effectiveType = sandboxType ?? sourceAssignment?.filterType ?? "OFF";

  const padToVariation = (padNumber: number) => {
    const idx = Math.max(0, Math.min(15, padNumber - 1));
    const row = Math.floor(idx / 4);
    const col = idx % 4;
    return (3 - row) * 4 + col + 1;
  };

  const displayValue = (padNumber: number): string => {
    const variationIndex = padToVariation(padNumber);
    if (parameter === "TUNE") {
      const rootVariationIndex = padToVariation(rootPad);
      const semis = Math.max(-12, Math.min(12, variationIndex - rootVariationIndex));
      if (semis === 0) return "0";
      return semis > 0 ? `+${semis}` : `${semis}`;
    }
    if (parameter === "FILTER") {
      const cutoff = variationIndex <= 8
        ? (variationIndex - 1) / 7 * effectiveCutoff
        : effectiveCutoff + (variationIndex - 8) / 8 * (100 - effectiveCutoff);
      return String(Math.round(cutoff));
    }
    if (parameter === "ATTACK" || parameter === "DECAY") {
      return String(Math.round(((variationIndex - 1) / 15) * 100));
    }
    return String(Math.round(1 + 126 * (variationIndex - 1) / 15));
  };

  return (
    <ScreenFrame title="16 LEVELS" subtitle="Pad parameter spread">
      {shell(
        <div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-[2.3%]">
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <PanelRow
              label="SOURCE PAD"
              value={sourceArmed ? `${sourcePad} ← SELECT PAD` : sourcePad}
              highlighted={sourceArmed}
            />
            <PanelRow label="PARAMETER" value={parameter} />
            {parameter === "TUNE" && (
              <ArrowRow
                label="ROOT PAD"
                value={`P${String(rootPad).padStart(2, "0")}`}
                onPrev={() => cycleSixteenLevelsRootPad(-1)}
                onNext={() => cycleSixteenLevelsRootPad(1)}
              />
            )}
            {parameter === "FILTER" && (
              <>
                <PanelRow
                  label="FILTER TYPE"
                  value={effectiveType}
                  onClick={cycleSixteenLevelsFilterType}
                  highlighted={sandboxType != null}
                />
                <ArrowRow
                  label="CUTOFF"
                  value={String(effectiveCutoff)}
                  onPrev={() => adjustSixteenLevelsFilterCutoff(-1)}
                  onNext={() => adjustSixteenLevelsFilterCutoff(1)}
                  highlighted={sandboxCutoff != null}
                />
                <ArrowRow
                  label="RESONANCE"
                  value={String(effectiveResonance)}
                  onPrev={() => adjustSixteenLevelsFilterResonance(-1)}
                  onNext={() => adjustSixteenLevelsFilterResonance(1)}
                  highlighted={sandboxResonance != null}
                />
              </>
            )}
          </section>
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">PREVIEW VALUES</p>
            <div className="grid grid-cols-4 gap-[8px]">
              {Array.from({ length: 16 }, (_, index) => {
                const padNumber = index + 1;
                const padId = `P${String(padNumber).padStart(2, "0")}`;
                const isRoot = parameter === "TUNE" && padNumber === rootPad;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => triggerPad(padId)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSixteenLevelsSourceFromPad(padId);
                    }}
                    className="border border-[#46533b] bg-black/15 p-[8%] text-left hover:bg-black/30 active:bg-black/40"
                  >
                    <span className="block">{padId}</span>
                    <span className={isRoot ? "text-amber-200" : "text-[#91a477]"}>
                      {displayValue(padNumber)}
                    </span>
                  </button>
                );
              })}
            </div>
            {parameter === "FILTER" && effectiveType === "OFF" && (
              <p className="text-[clamp(8px,0.6vw,10px)] text-amber-300">
                Filter OFF — click FILTER TYPE above to enable LP / HP / BP.
              </p>
            )}
          </section>
        </div>,
        [
          { label: sourceArmed ? "F1 CANCEL" : "F1 SOURCE", onClick: armSixteenLevelsSource },
          { label: "F2 PARAM", onClick: cycleSixteenLevelsParameter },
          "F3 —",
          "F4 —",
          "F5 —",
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

function PanelRow({ label, value, onClick, highlighted = false }: { label: string; value: string; onClick?: () => void; highlighted?: boolean }) {
  const content = (
    <>
      <p className="text-[#91a477]">{label}</p>
      <p className={highlighted ? "text-amber-200" : ""}>{value}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="grid content-start gap-[2px] text-left">
        {content}
      </button>
    );
  }
  return <div>{content}</div>;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid content-start gap-[2px]">
      <p className="text-[#91a477]">{label}</p>
      <p className="text-center text-[#eef6d8]">{value}</p>
    </div>
  );
}

function ArrowRow({
  label,
  value,
  onPrev,
  onNext,
  highlighted = false,
  editable,
}: {
  label: string;
  value: string;
  onPrev: () => void;
  onNext: () => void;
  highlighted?: boolean;
  editable?: {
    numericValue: number;
    format?: (n: number) => string;
    min?: number;
    max?: number;
    allowDecimal?: boolean;
    allowNegative?: boolean;
    onCommit: (newValue: number) => void;
  };
}) {
  const prevHold = useHoldRepeat(onPrev);
  const nextHold = useHoldRepeat(onNext);
  return (
    <div className="grid content-start gap-[2px]">
      <p className="text-[#91a477]">{label}</p>
      <div className="grid grid-cols-[22px_1fr_22px] items-center gap-[4px]">
        <button
          type="button"
          tabIndex={-1}
          {...prevHold}
          className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]"
        >
          &lt;
        </button>
        {editable ? (
          <EditableNumber
            value={editable.numericValue}
            format={editable.format}
            min={editable.min}
            max={editable.max}
            allowDecimal={editable.allowDecimal}
            allowNegative={editable.allowNegative}
            onCommit={editable.onCommit}
            ariaLabel={label}
          />
        ) : (
          <span className={`text-center ${highlighted ? "text-amber-200" : ""}`}>{value}</span>
        )}
        <button
          type="button"
          tabIndex={-1}
          {...nextHold}
          className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]"
        >
          &gt;
        </button>
      </div>
    </div>
  );
}

export function TrackMuteUtilityScreen() {
  const tracks = useAppStore((s) => s.performanceTracks);
  const mode = useAppStore((s) => s.trackMuteMode);
  const setTrackMuteMode = useAppStore((s) => s.setTrackMuteMode);
  const togglePerformanceTrack = useAppStore((s) => s.togglePerformanceTrack);
  const clearTrackMutes = useAppStore((s) => s.clearTrackMutes);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  const soloTrack = tracks.find((track) => track.solo)?.name ?? "OFF";
  return (
    <ScreenFrame title="TRACK MUTE" subtitle="Live performance mute">
      {shell(
        <div className="grid h-full grid-cols-[1.15fr_0.7fr] gap-[2.3%]">
          <section className="grid grid-cols-4 grid-rows-4 gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(9px,0.72vw,11px)] tracking-[0.12em]">
            {Array.from({ length: 16 }, (_, index) => {
              const track = tracks[index];
              const groupView = mode === "GROUP" || mode === "UNGROUP";
              const status = track?.solo ? "SOLO" : track?.muted ? "MUTED" : track ? "LIVE" : "---";
              const groupLabel = !track ? "---" : (track.group ?? 0) === 0 ? "—" : `G${track.group}`;
              const tileClass = !track
                ? "border-[#293225] bg-black/10 text-[#3f4b35]"
                : groupView
                  ? (track.group ?? 0) > 0
                    ? "border-[#d8b34d] bg-amber-200/10 text-amber-100"
                    : "border-[#46533b] bg-black/20 text-[#aab691]"
                  : track.solo
                    ? "border-amber-300 bg-amber-200/15 text-amber-100"
                    : track.muted
                      ? "border-[#46533b] bg-black/25 text-[#70805c]"
                      : "border-[#70845a] bg-[#d8e3b7]/10 text-[#eef6d8]";
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!track}
                  onClick={() => togglePerformanceTrack(index)}
                  title={
                    mode === "GROUP"
                      ? "Click cycles group 0–16"
                      : mode === "UNGROUP"
                        ? "Click sets group to 0"
                        : undefined
                  }
                  className={`grid content-between border p-[8%] text-left ${tileClass}`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate">{track?.name ?? "EMPTY"}</span>
                  <div className="flex items-center justify-between gap-[6px]">
                    {groupView ? (
                      <span className="text-[clamp(11px,1vw,16px)] font-semibold tracking-[0.2em]">
                        {groupLabel}
                      </span>
                    ) : (
                      <>
                        <span className="text-[#91a477]">{status}</span>
                        {track && (track.group ?? 0) > 0 ? <span className="text-[#d8b34d]">G{track.group}</span> : null}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </section>
          <Panel rows={[["MODE", mode], ["SOLO TRACK", soloTrack], ["MUTED", String(tracks.filter((track) => track.muted).length).padStart(2, "0")], ["ACTIVE", String(tracks.filter((track) => !track.muted).length).padStart(2, "0")]]} />
        </div>,
        [
          { label: "F1 MUTE", onClick: () => setTrackMuteMode("MUTE") },
          { label: "F2 SOLO", onClick: () => setTrackMuteMode("SOLO") },
          { label: "F3 GROUP", onClick: () => setTrackMuteMode("GROUP") },
          { label: "F4 UNGROUP", onClick: () => setTrackMuteMode("UNGROUP") },
          { label: "F5 CLEAN", onClick: clearTrackMutes },
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

export function PadMuteUtilityScreen() {
  const bank = useAppStore((s) => s.padBank);
  const pads = useAppStore((s) => s.padMixer[bank]);
  const mode = useAppStore((s) => s.padMuteMode);
  const setPadMuteMode = useAppStore((s) => s.setPadMuteMode);
  const applyPadMuteAction = useAppStore((s) => s.applyPadMuteAction);
  const clearPadMutes = useAppStore((s) => s.clearPadMutes);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  const anySolo = pads.some((pad) => pad.solo);
  const mutedCount = pads.filter((pad) => pad.muted).length;
  const soloPad = pads.find((pad) => pad.solo)?.pad ?? "OFF";
  return (
    <ScreenFrame title="PAD MUTE" subtitle={`Bank ${bank} — live pad mute`}>
      {shell(
        <div className="grid h-full grid-cols-[1.15fr_0.7fr] gap-[2.3%]">
          <section className="grid grid-cols-4 grid-rows-4 gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(9px,0.72vw,11px)] tracking-[0.12em]">
            {pads.map((pad) => {
              const groupView = mode === "GROUP" || mode === "UNGROUP";
              const audible = !pad.muted && (!anySolo || pad.solo);
              const status = pad.solo ? "SOLO" : pad.muted ? "MUTED" : "LIVE";
              const groupLabel = (pad.group ?? 0) === 0 ? "—" : `G${pad.group}`;
              const tileClass = groupView
                ? (pad.group ?? 0) > 0
                  ? "border-[#d8b34d] bg-amber-200/10 text-amber-100"
                  : "border-[#46533b] bg-black/20 text-[#aab691]"
                : pad.solo
                  ? "border-amber-300 bg-amber-200/15 text-amber-100"
                  : pad.muted
                    ? "border-red-400 bg-red-500/20 text-red-200"
                    : audible
                      ? "border-[#70845a] bg-[#d8e3b7]/10 text-[#eef6d8]"
                      : "border-[#46533b] bg-black/20 text-[#70805c]";
              return (
                <button
                  key={pad.pad}
                  type="button"
                  onClick={() => applyPadMuteAction(pad.pad)}
                  title={
                    mode === "GROUP"
                      ? "Click cycles group 0–16"
                      : mode === "UNGROUP"
                        ? "Click sets group to 0"
                        : undefined
                  }
                  className={`grid content-between border p-[8%] text-left ${tileClass}`}
                >
                  <span>{pad.pad}</span>
                  <div className="flex items-center justify-between gap-[4px]">
                    {groupView ? (
                      <span className="text-[clamp(11px,1vw,16px)] font-semibold tracking-[0.2em]">
                        {groupLabel}
                      </span>
                    ) : (
                      <>
                        <span className="text-[#91a477]">{status}</span>
                        {(pad.group ?? 0) > 0 ? <span className="text-[#d8b34d]">G{pad.group}</span> : null}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </section>
          <Panel
            rows={[
              ["MODE", mode],
              ["BANK", bank],
              ["SOLO PAD", soloPad],
              ["MUTED", String(mutedCount).padStart(2, "0")],
              ["ACTIVE", String(16 - mutedCount).padStart(2, "0")],
            ]}
          />
        </div>,
        [
          { label: "F1 MUTE", onClick: () => setPadMuteMode("MUTE") },
          { label: "F2 SOLO", onClick: () => setPadMuteMode("SOLO") },
          { label: "F3 GROUP", onClick: () => setPadMuteMode("GROUP") },
          { label: "F4 UNGROUP", onClick: () => setPadMuteMode("UNGROUP") },
          { label: "F5 CLEAN", onClick: clearPadMutes },
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

export function NextSeqUtilityScreen() {
  const sequences = useAppStore((s) => s.sequences);
  const current = useAppStore((s) => s.currentSequence);
  const queued = useAppStore((s) => s.queuedSequence);
  const queuedBarsRemaining = useAppStore((s) => s.queuedSequenceBarsRemaining);
  const queuePerformanceSequence = useAppStore((s) => s.queuePerformanceSequence);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="NEXT SEQ" subtitle="Live sequence queue">
      {shell(
        <div className="grid h-full grid-cols-[1.15fr_0.7fr] gap-[2.3%]">
          <section className="grid grid-cols-2 content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%]">
            {sequences.map((seq) => (
              <button
                key={seq.id}
                type="button"
                onClick={() => queuePerformanceSequence(seq.id)}
                className={`border p-[5%] text-left ${
                  seq.id === queued
                    ? "animate-pulse border-amber-300 bg-amber-200/15 text-amber-100"
                    : seq.id === current
                      ? "border-[#91a477] bg-[#d8e3b7]/10 text-[#eef6d8]"
                      : "border-[#46533b] text-[#d8e3b7]"
                }`}
              >
                <p>{seq.name}</p>
                <p className="text-[#91a477]">{seq.id === queued ? "QUEUED BAR END" : seq.id === current ? "ACTIVE" : "READY"}</p>
              </button>
            ))}
          </section>
          <Panel rows={[
            ["CURRENT", sequences.find((seq) => seq.id === current)?.name ?? "---"],
            ["QUEUED", sequences.find((seq) => seq.id === queued)?.name ?? "---"],
            ["CHANGE AT", queued ? `END OF BAR / ${String(queuedBarsRemaining).padStart(2, "0")}` : "---"],
          ]} />
        </div>,
        ["SELECT PAD","BAR END","ACTIVE","QUEUED","",{ label: "F6 EXIT", onClick: exit }],
        exit,
      )}
    </ScreenFrame>
  );
}

export function NoteRepeatUtilityScreen() {
  const timingCorrect = useAppStore((s) => s.timingCorrect);
  const swing = useAppStore((s) => s.swing);
  const noteRepeatGate = useAppStore((s) => s.noteRepeatGate);
  const tripletMode = useAppStore((s) => s.tripletMode);
  const noteRepeatVelocityMode = useAppStore((s) => s.noteRepeatVelocityMode);
  const cycleNoteRepeatRate = useAppStore((s) => s.cycleNoteRepeatRate);
  const cycleNoteRepeatRateBack = useAppStore((s) => s.cycleNoteRepeatRateBack);
  const adjustNoteRepeatGate = useAppStore((s) => s.adjustNoteRepeatGate);
  const setNoteRepeatGate = useAppStore((s) => s.setNoteRepeatGate);
  const adjustSwing = useAppStore((s) => s.adjustSwing);
  const setSwing = useAppStore((s) => s.setSwing);
  const toggleTripletMode = useAppStore((s) => s.toggleTripletMode);
  const cycleNoteRepeatVelocityMode = useAppStore((s) => s.cycleNoteRepeatVelocityMode);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  return (
    <ScreenFrame title="NOTE REPEAT" subtitle="Repeat timing utility">
      {shell(
        <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
          <ArrowRow label="RATE" value={timingCorrect === "OFF" ? "1/16" : timingCorrect} onPrev={cycleNoteRepeatRateBack} onNext={cycleNoteRepeatRate} />
          <ArrowRow
            label="GATE"
            value={`${noteRepeatGate}%`}
            onPrev={() => adjustNoteRepeatGate(-1)}
            onNext={() => adjustNoteRepeatGate(1)}
            editable={{
              numericValue: noteRepeatGate,
              format: (n) => `${n}`,
              min: 1,
              max: 100,
              onCommit: setNoteRepeatGate,
            }}
          />
          <ArrowRow
            label="SWING"
            value={`${swing}%`}
            onPrev={() => adjustSwing(-1)}
            onNext={() => adjustSwing(1)}
            editable={{
              numericValue: swing,
              min: 50,
              max: 75,
              onCommit: setSwing,
            }}
          />
          <ArrowRow label="TRIPLET" value={tripletMode ? "ON" : "OFF"} onPrev={toggleTripletMode} onNext={toggleTripletMode} />
          <ArrowRow label="VELOCITY MODE" value={noteRepeatVelocityMode} onPrev={cycleNoteRepeatVelocityMode} onNext={cycleNoteRepeatVelocityMode} />
        </section>,
        [
          { label: "F1 RATE", onClick: cycleNoteRepeatRate },
          { label: "F2 GATE", onClick: () => adjustNoteRepeatGate(5) },
          { label: "F3 SWING", onClick: () => adjustSwing(1) },
          { label: "F4 TRIPLET", onClick: toggleTripletMode },
          { label: "F5 VELOCITY", onClick: cycleNoteRepeatVelocityMode },
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

export function TimingCorrectUtilityScreen() {
  const timingCorrect = useAppStore((s) => s.timingCorrect);
  const swing = useAppStore((s) => s.swing);
  const timingApplyTo = useAppStore((s) => s.timingApplyTo);
  const cycleTimingCorrect = useAppStore((s) => s.cycleTimingCorrect);
  const adjustSwing = useAppStore((s) => s.adjustSwing);
  const cycleTimingApplyTo = useAppStore((s) => s.cycleTimingApplyTo);
  const applyTimingCorrectToEvents = useAppStore((s) => s.applyTimingCorrectToEvents);
  const resetTimingCorrect = useAppStore((s) => s.resetTimingCorrect);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  const swingEnabled = timingCorrect === "1/16" || timingCorrect === "1/8";

  return (
    <ScreenFrame title="TIMING CORRECT" subtitle="Global timing utility">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.7fr] gap-[2.3%]">
          <Panel rows={[
            ["NOTE VALUE", timingCorrect],
            ["SWING", swingEnabled ? `${swing}%` : "—"],
            ["APPLY TO", timingApplyTo],
          ]} />
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[5%] text-[clamp(10px,0.8vw,13px)]">
            <UtilityAction label="SWING +" onClick={() => adjustSwing(1)} disabled={!swingEnabled} />
            <UtilityAction label="SWING -" onClick={() => adjustSwing(-1)} disabled={!swingEnabled} />
            <UtilityAction label="DO IT" onClick={applyTimingCorrectToEvents} />
          </section>
        </div>,
        [
          { label: "F1 NOTE", onClick: cycleTimingCorrect },
          { label: "F2 SWING", onClick: swingEnabled ? () => adjustSwing(1) : undefined },
          { label: "F3 DO IT", onClick: applyTimingCorrectToEvents },
          { label: "F4 SCOPE", onClick: cycleTimingApplyTo },
          { label: "F5 RESET", onClick: resetTimingCorrect },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function CountInUtilityScreen() {
  const metronomeEnabled = useAppStore((s) => s.metronomeEnabled);
  const metronomeDuringRecord = useAppStore((s) => s.metronomeDuringRecord);
  const metronomeCountInBars = useAppStore((s) => s.metronomeCountInBars);
  const metronomeVolume = useAppStore((s) => s.metronomeVolume);
  const timingCorrectionCountEnabled = useAppStore((s) => s.timingCorrectionCountEnabled);
  const waitPadCompatEnabled = useAppStore((s) => s.waitPadCompatEnabled);
  const transportPhase = useAppStore((s) => s.transportPhase);
  const transportCountInBeatsRemaining = useAppStore((s) => s.transportCountInBeatsRemaining);
  const toggleMetronomeEnabled = useAppStore((s) => s.toggleMetronomeEnabled);
  const toggleMetronomeDuringRecord = useAppStore((s) => s.toggleMetronomeDuringRecord);
  const adjustMetronomeCountInBars = useAppStore((s) => s.adjustMetronomeCountInBars);
  const adjustMetronomeVolume = useAppStore((s) => s.adjustMetronomeVolume);
  const setMetronomeCountInBars = useAppStore((s) => s.setMetronomeCountInBars);
  const setMetronomeVolume = useAppStore((s) => s.setMetronomeVolume);
  const toggleTimingCorrectionCount = useAppStore((s) => s.toggleTimingCorrectionCount);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);

  const exitToMain = () => setActiveScreen("MAIN");
  const activeBeat =
    transportPhase === "COUNT_IN" && transportCountInBeatsRemaining > 0
      ? (4 - ((transportCountInBeatsRemaining - 1) % 4)) % 4
      : -1;

  return (
    <ScreenFrame title="COUNT IN / METRONOME" subtitle="Transport utility">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.62fr] gap-[2.3%]">
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[5%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">SETTINGS</p>
            <StatusRow label="METRONOME" value={metronomeEnabled ? "ON" : "OFF"} />
            <StatusRow label="DURING REC" value={metronomeDuringRecord ? "ON" : "OFF"} />
            <ArrowRow
              label="COUNT BARS"
              value={String(metronomeCountInBars)}
              onPrev={() => adjustMetronomeCountInBars(-1)}
              onNext={() => adjustMetronomeCountInBars(1)}
              editable={{
                numericValue: metronomeCountInBars,
                min: 0,
                max: 8,
                onCommit: (v) => setMetronomeCountInBars(Math.round(v)),
              }}
            />
            <ArrowRow
              label="CLICK VOL"
              value={String(metronomeVolume)}
              onPrev={() => adjustMetronomeVolume(-1)}
              onNext={() => adjustMetronomeVolume(1)}
              editable={{
                numericValue: metronomeVolume,
                min: 0,
                max: 100,
                onCommit: (v) => setMetronomeVolume(Math.round(v)),
              }}
            />
            <StatusRow label="TC COUNT" value={timingCorrectionCountEnabled ? "ON" : "OFF"} />
            <StatusRow label="WAIT PAD COMPAT" value={waitPadCompatEnabled ? "ON" : "OFF"} />
          </section>

          <section className="grid content-start gap-[14px] border border-[#46533b] bg-black/20 p-[6%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">METRONOME</p>
            <div className="grid grid-cols-4 gap-[8px]">
              {Array.from({ length: 4 }, (_, index) => (
                <span
                  key={index}
                  className={`h-[18px] border ${
                    index === activeBeat
                      ? "animate-pulse border-[#eef6d8] bg-[#d8e3b7]"
                      : "border-[#46533b] bg-black/20"
                  }`}
                />
              ))}
            </div>
            <div className="border border-[#46533b] bg-black/15 p-[8%]">
              <p className="text-[#91a477]">STATE</p>
              <p className="mt-[6px] text-[#eef6d8]">
                {transportPhase === "COUNT_IN" ? "COUNTING" : "READY"}
              </p>
            </div>
          </section>
        </div>,
        [
          { label: "F1 COUNT", onClick: () => adjustMetronomeCountInBars(1) },
          { label: "F2 CLICK", onClick: toggleMetronomeEnabled },
          { label: "F3 VOL", onClick: () => adjustMetronomeVolume(metronomeVolume >= 100 ? -100 : 10) },
          { label: "F4 TC", onClick: toggleTimingCorrectionCount },
          { label: "F5 REC", onClick: toggleMetronomeDuringRecord },
          { label: "F6 EXIT", onClick: exitToMain },
        ],
      )}
    </ScreenFrame>
  );
}

export function GoToUtilityScreen() {
  const currentBar = useAppStore((s) => s.currentBar);
  const currentStep = useAppStore((s) => s.currentStep);
  const currentEvent = useAppStore((s) => s.currentEvent);
  const sequence = useAppStore((s) => s.sequence);
  const sequences = useAppStore((s) => s.sequences);
  const currentSequence = useAppStore((s) => s.currentSequence);
  const sequenceLengthBars = useAppStore((s) => s.sequenceLengthBars);
  const goToTarget = useAppStore((s) => s.goToTarget);
  const setGoToTarget = useAppStore((s) => s.setGoToTarget);
  const adjustGoToValue = useAppStore((s) => s.adjustGoToValue);
  const setGoToValue = useAppStore((s) => s.setGoToValue);
  const executeGoTo = useAppStore((s) => s.executeGoTo);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  const seqOrdinal = Math.max(1, sequences.findIndex((s) => s.id === currentSequence) + 1);

  const rows: Array<{
    label: typeof goToTarget;
    value: number;
    format: (n: number) => string;
    min: number;
    max: number;
  }> = [
    { label: "BAR", value: currentBar, format: (n) => String(n).padStart(3, "0"), min: 1, max: sequenceLengthBars },
    { label: "STEP", value: currentStep, format: (n) => String(n).padStart(2, "0"), min: 1, max: 16 },
    { label: "EVENT", value: currentEvent, format: (n) => String(n).padStart(3, "0"), min: 1, max: 999 },
    { label: "SEQ", value: seqOrdinal, format: (n) => `A${String(n).padStart(2, "0")}`, min: 1, max: Math.max(1, sequences.length) },
  ];

  return (
    <ScreenFrame title="GO TO" subtitle="Locate event">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.72fr] gap-[2.3%]">
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            {rows.map((row) => (
              <div
                key={row.label}
                className={`grid grid-cols-[1fr_auto] border px-[4%] py-[3%] text-left ${
                  row.label === goToTarget
                    ? "border-[#eef6d8] bg-[#d8e3b7]/10 text-[#eef6d8]"
                    : "border-[#46533b] text-[#aab691]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setGoToTarget(row.label)}
                  className="text-left"
                >
                  {row.label}
                </button>
                <EditableNumber
                  value={row.value}
                  format={row.format}
                  min={row.min}
                  max={row.max}
                  onCommit={(v) => {
                    setGoToTarget(row.label);
                    setGoToValue(row.label, Math.round(v));
                  }}
                  ariaLabel={row.label}
                />
              </div>
            ))}
            <span className="text-[10px] text-[#91a477]">(current seq: {`A${sequence.padStart(2, "0")}`})</span>
          </section>
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[5%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">TARGET</p>
            <p className="text-xl tracking-[0.18em] text-[#eef6d8]">{goToTarget}</p>
            <div className="mt-[8px] grid grid-cols-2 gap-[8px]">
              <UtilityAction label="-" onClick={() => adjustGoToValue(-1)} />
              <UtilityAction label="+" onClick={() => adjustGoToValue(1)} />
            </div>
          </section>
        </div>,
        [
          { label: "F1 BAR", onClick: () => setGoToTarget("BAR") },
          { label: "F2 STEP", onClick: () => setGoToTarget("STEP") },
          { label: "F3 EVENT", onClick: () => setGoToTarget("EVENT") },
          { label: "F4 SEQ", onClick: () => setGoToTarget("SEQ") },
          { label: "F5 EXECUTE", onClick: executeGoTo },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function EraseUtilityScreen() {
  const eraseMode = useAppStore((s) => s.eraseMode);
  const setEraseMode = useAppStore((s) => s.setEraseMode);
  const executeErase = useAppStore((s) => s.executeErase);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  return (
    <ScreenFrame title="ERASE" subtitle="Edit utility">
      {shell(
        <div className="grid h-full grid-cols-[1fr_0.72fr] gap-[2.3%]">
          <SelectablePanel
            active={eraseMode}
            onSelect={(label) => setEraseMode(label as typeof eraseMode)}
            rows={[
              ["PAD", eraseMode === "PAD" ? "ERASE PAD" : ""],
              ["TRACK", eraseMode === "TRACK" ? "ERASE TRACK" : ""],
              ["BAR", eraseMode === "BAR" ? "ERASE BAR" : ""],
              ["EVENTS", eraseMode === "EVENTS" ? "ERASE EVENTS" : ""],
              ["AUTOMATION", eraseMode === "AUTOMATION" ? "ERASE AUTOMATION" : ""],
            ]}
          />
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[5%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">ARMED MODE</p>
            <p className="text-xl tracking-[0.18em] text-[#eef6d8]">{eraseMode}</p>
            <p className="mt-[8px] leading-relaxed text-[#aab691]">
              Future hold workflow reserved for ERASE + PAD during playback.
            </p>
          </section>
        </div>,
        [
          { label: "F1 PAD", onClick: () => setEraseMode("PAD") },
          { label: "F2 TRACK", onClick: () => setEraseMode("TRACK") },
          { label: "F3 BAR", onClick: () => setEraseMode("BAR") },
          { label: "F4 EVENTS", onClick: () => setEraseMode("EVENTS") },
          { label: "F5 EXECUTE", onClick: executeErase },
          { label: "F6 CANCEL", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

export function UndoUtilityScreen() {
  const undoHistory = useAppStore((s) => s.undoHistory);
  const redoHistory = useAppStore((s) => s.redoHistory);
  const lastAction = useAppStore((s) => s.lastAction);
  const undoLastAction = useAppStore((s) => s.undoLastAction);
  const redoLastAction = useAppStore((s) => s.redoLastAction);
  const clearUndoHistory = useAppStore((s) => s.clearUndoHistory);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);
  const recentActions = [...undoHistory].reverse().slice(0, 8).map((entry) => entry.label);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);
  const handleClear = () => {
    if (confirmClear) {
      clearUndoHistory();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  };

  return (
    <ScreenFrame title="UNDO" subtitle="Action history">
      {shell(
        <div className="grid h-full grid-cols-[0.86fr_1.14fr] gap-[2.3%]">
          <Panel
            rows={[
              ["LAST ACTION", lastAction || "—"],
              ["UNDO DEPTH", String(undoHistory.length)],
              ["REDO DEPTH", String(redoHistory.length)],
            ]}
          />
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
            <p className="text-[#91a477]">RECENT OPERATIONS</p>
            {recentActions.length === 0 ? (
              <p className="text-[#46533b]">—</p>
            ) : (
              recentActions.map((action, index) => (
                <div key={`${action}-${index}`} className="grid grid-cols-[32px_1fr] border border-[#46533b] bg-black/15 px-[4%] py-[3%]">
                  <span className="text-[#91a477]">{index + 1}.</span>
                  <span>{action}</span>
                </div>
              ))
            )}
          </section>
        </div>,
        [
          { label: "F1 UNDO", onClick: undoLastAction },
          { label: "F2 REDO", onClick: redoLastAction },
          { label: confirmClear ? "F3 CONFIRM" : "F3 CLEAR", onClick: handleClear },
          "F4 —",
          "F5 —",
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

export function SequenceEditUtilityScreen() {
  const sequenceName = useAppStore((s) => s.sequenceName);
  const sequenceLengthBars = useAppStore((s) => s.sequenceLengthBars);
  const timeSignature = useAppStore((s) => s.timeSignature);
  const bpm = useAppStore((s) => s.bpm);
  const createSequence = useAppStore((s) => s.createSequence);
  const duplicateCurrentSequence = useAppStore((s) => s.duplicateCurrentSequence);
  const deleteCurrentSequence = useAppStore((s) => s.deleteCurrentSequence);
  const renameCurrentSequence = useAppStore((s) => s.renameCurrentSequence);
  const exit = useAppStore((s) => s.exitUtilityWorkflow);

  return (
    <ScreenFrame title="SEQUENCE" subtitle="Sequence utility">
      {shell(
        <Panel rows={[
          ["NAME", sequenceName],
          ["BARS", String(sequenceLengthBars).padStart(3, "0")],
          ["TSIG", timeSignature],
          ["BPM", bpm.toFixed(2)],
        ]} />,
        [
          { label: "F1 NEW", onClick: createSequence },
          { label: "F2 DUP", onClick: duplicateCurrentSequence },
          { label: "F3 DELETE", onClick: deleteCurrentSequence },
          { label: "F4 RENAME", onClick: renameCurrentSequence },
          { label: "F5 SONG", onClick: undefined },
          { label: "F6 EXIT", onClick: exit },
        ],
      )}
    </ScreenFrame>
  );
}

function Panel({ rows }: { rows: [string, string][] }) {
  return <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">{rows.map(([a,b])=><div key={a}><p className="text-[#91a477]">{a}</p><p>{b}</p></div>)}</section>;
}

function SelectablePanel({
  active,
  rows,
  onSelect,
}: {
  active: string;
  rows: [string, string][];
  onSelect?: (label: string) => void;
}) {
  return (
    <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)]">
      {rows.map(([label, value]) => {
        const className = `grid grid-cols-[1fr_auto] border px-[4%] py-[3%] text-left ${
          label === active
            ? "border-[#eef6d8] bg-[#d8e3b7]/10 text-[#eef6d8]"
            : "border-[#46533b] text-[#aab691] hover:bg-black/30"
        }`;
        if (onSelect) {
          return (
            <button key={label} type="button" onClick={() => onSelect(label)} className={className}>
              <span>{label}</span>
              <span>{value}</span>
            </button>
          );
        }
        return (
          <div key={label} className={className}>
            <span>{label}</span>
            <span>{value}</span>
          </div>
        );
      })}
    </section>
  );
}

function UtilityAction({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="border border-[#46533b] bg-black/25 px-[3%] py-[10%] disabled:opacity-40">
      {label}
    </button>
  );
}
type Softkey =
  | string
  | {
      label: string;
      onClick?: () => void;
    };

function Softkeys({ labels, onExit }: { labels: Softkey[]; onExit?: () => void }) {
  return (
    <div className="grid grid-cols-6 gap-[1.4%]">
      {labels.map((softkey, index) => {
        const label = typeof softkey === "string" ? softkey : softkey.label;
        const onClick =
          typeof softkey === "string"
            ? label.endsWith("EXIT")
              ? onExit
              : undefined
            : softkey.onClick;

        return (
          <button
            key={index}
            type="button"
            onClick={onClick}
            className="border border-[#46533b] bg-black/25 px-[3%] py-[7%] text-[clamp(8px,0.7vw,11px)]"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const DEN_CYCLE: Array<4 | 8 | 16 | 32> = [4, 8, 16, 32];

type BarEditorAction = "VIEW" | "EDIT_TS" | "INSERT" | "DELETE" | "COPY";
const BAR_EDITOR_ACTIONS: BarEditorAction[] = ["VIEW", "EDIT_TS", "INSERT", "DELETE", "COPY"];
const ACTION_LABELS: Record<BarEditorAction, string> = {
  VIEW: "VIEW",
  EDIT_TS: "EDIT TS",
  INSERT: "INSERT BARS",
  DELETE: "DELETE BARS",
  COPY: "COPY BARS",
};

export function BarEditorScreen() {
  const sequences = useAppStore((s) => s.sequences);
  const currentSequence = useAppStore((s) => s.currentSequence);
  const stepEvents = useAppStore((s) => s.stepEvents);
  const bpm = useAppStore((s) => s.bpm);
  const changeBarTimeSignature = useAppStore((s) => s.changeBarTimeSignature);
  const insertBlankBars = useAppStore((s) => s.insertBlankBars);
  const deleteBars = useAppStore((s) => s.deleteBars);
  const copyBars = useAppStore((s) => s.copyBars);
  const closeBarEditor = useAppStore((s) => s.closeBarEditor);

  const sequence = sequences.find((s) => s.id === currentSequence);
  const barCount = sequence?.lengthBars ?? 1;

  const [selectedBar, setSelectedBar] = useState(0); // 0-indexed
  const [action, setAction] = useState<BarEditorAction>("VIEW");
  const [editNum, setEditNum] = useState(4);
  const [editDen, setEditDen] = useState<4 | 8 | 16 | 32>(4);
  const [insertCount, setInsertCount] = useState(1);
  const [deleteFirst, setDeleteFirst] = useState(0);
  const [deleteLast, setDeleteLast] = useState(0);
  const [copyFromSeqId, setCopyFromSeqId] = useState<string>("");
  const [copyFirstBar, setCopyFirstBar] = useState(0);
  const [copyLastBar, setCopyLastBar] = useState(0);
  const [copyToSeqId, setCopyToSeqId] = useState<string>("");
  const [copyBeforeBar, setCopyBeforeBar] = useState(0);
  const [copyCount, setCopyCount] = useState(1);

  const tsAtBar = (idx: number) => {
    if (!sequence) return { num: 4, den: 4 as 4 | 8 | 16 | 32 };
    const changes = sequence.timeSignatureChanges ?? [];
    let resolved = changes[0] ?? { fromBar: 0, num: 4, den: 4 as 4 | 8 | 16 | 32 };
    for (const c of changes) {
      if (c.fromBar <= idx) resolved = c;
      else break;
    }
    return { num: resolved.num, den: resolved.den };
  };

  const eventsInBar = (idx: number) =>
    stepEvents.filter((e) => Number(e.step.split(".")[0]) === idx + 1).length;

  const stepsInBar = (idx: number) => {
    const ts = tsAtBar(idx);
    return Math.max(1, Math.floor(((ts.num * 384) / ts.den) / 24));
  };

  const cycleAction = () => {
    const i = BAR_EDITOR_ACTIONS.indexOf(action);
    const next = BAR_EDITOR_ACTIONS[(i + 1) % BAR_EDITOR_ACTIONS.length];
    setAction(next);
    if (next === "EDIT_TS") {
      const ts = tsAtBar(selectedBar);
      setEditNum(ts.num);
      setEditDen(ts.den);
    }
    if (next === "INSERT") {
      const ts = tsAtBar(selectedBar);
      setEditNum(ts.num);
      setEditDen(ts.den);
      setInsertCount(1);
    }
    if (next === "DELETE") {
      setDeleteFirst(selectedBar);
      setDeleteLast(selectedBar);
    }
    if (next === "COPY") {
      setCopyFromSeqId(currentSequence);
      setCopyToSeqId(currentSequence);
      setCopyFirstBar(selectedBar);
      setCopyLastBar(selectedBar);
      setCopyBeforeBar(barCount);
      setCopyCount(1);
    }
  };

  const cycleSeqId = (current: string, delta: number): string => {
    if (sequences.length === 0) return current;
    const i = sequences.findIndex((s) => s.id === current);
    const safeIdx = i === -1 ? 0 : i;
    const next = (safeIdx + delta + sequences.length) % sequences.length;
    return sequences[next].id;
  };

  const seqBarCount = (id: string): number => sequences.find((s) => s.id === id)?.lengthBars ?? 1;

  const adjustNum = (delta: number) => setEditNum((p) => Math.max(1, Math.min(31, p + delta)));
  const adjustDen = (delta: number) => setEditDen((p) => {
    const i = DEN_CYCLE.indexOf(p);
    return DEN_CYCLE[(i + delta + DEN_CYCLE.length) % DEN_CYCLE.length];
  });

  const doIt = () => {
    if (!sequence) return;
    if (action === "EDIT_TS") {
      const oldTs = tsAtBar(selectedBar);
      const newBarTicks = Math.round((editNum * 384) / editDen);
      const oldBarTicks = Math.round((oldTs.num * 384) / oldTs.den);
      if (newBarTicks < oldBarTicks) {
        const removed = stepEvents.filter((evt) => {
          const evBar = Number(evt.step.split(".")[0]);
          if (evBar !== selectedBar + 1) return false;
          const [, b, t] = evt.step.split(".");
          return (Number(b) - 1) * 96 + Number(t) >= newBarTicks;
        }).length;
        if (removed > 0) {
          const ok = window.confirm(`Bar ${selectedBar + 1} truncated. ${removed} events removed. Proceed?`);
          if (!ok) return;
        }
      }
      changeBarTimeSignature(selectedBar, editNum, editDen);
      return;
    }
    if (action === "INSERT") {
      if (barCount + insertCount > 999) {
        window.alert("Max bar count is 999.");
        return;
      }
      insertBlankBars(selectedBar, insertCount, editNum, editDen);
      return;
    }
    if (action === "DELETE") {
      if (deleteLast - deleteFirst + 1 >= barCount) {
        window.alert("Cannot delete all bars in the sequence.");
        return;
      }
      const removed = stepEvents.filter((evt) => {
        const evBar = Number(evt.step.split(".")[0]);
        return evBar >= deleteFirst + 1 && evBar <= deleteLast + 1;
      }).length;
      const range = deleteFirst === deleteLast ? `bar ${deleteFirst + 1}` : `bars ${deleteFirst + 1}–${deleteLast + 1}`;
      const ok = window.confirm(`Delete ${range}. ${removed} events will be removed. Proceed?`);
      if (!ok) return;
      deleteBars(deleteFirst, deleteLast);
      // Clamp selection.
      setSelectedBar(Math.min(selectedBar, Math.max(0, barCount - (deleteLast - deleteFirst + 1) - 1)));
      return;
    }
    if (action === "COPY") {
      if (copyLastBar < copyFirstBar) {
        window.alert("Invalid range: LAST BAR must be ≥ FIRST BAR.");
        return;
      }
      if (copyCount < 1) {
        window.alert("COPIES must be ≥ 1.");
        return;
      }
      const fromSeq = sequences.find((s) => s.id === copyFromSeqId);
      if (!fromSeq) {
        window.alert("Source sequence not found.");
        return;
      }
      copyBars({
        fromSeqId: copyFromSeqId,
        firstBarIndex: copyFirstBar,
        lastBarIndex: copyLastBar,
        toSeqId: copyToSeqId,
        beforeBarIndex: copyBeforeBar,
        copies: copyCount,
      });
      return;
    }
  };

  const selectedTs = tsAtBar(selectedBar);
  const selectedSteps = stepsInBar(selectedBar);
  const selectedEvents = eventsInBar(selectedBar);

  // Scroll-safe bar list: only render up to 12 around selection.
  const window_start = Math.max(0, Math.min(selectedBar - 5, Math.max(0, barCount - 12)));
  const window_end = Math.min(barCount, window_start + 12);
  const visibleBars = Array.from({ length: window_end - window_start }, (_, i) => window_start + i);

  return (
    <ScreenFrame title="BAR EDITOR" subtitle={`SEQ ${currentSequence} · BARS ${barCount}`}>
      {shell(
        <div className="grid h-full grid-cols-[0.7fr_1fr_1fr] gap-[2.3%]">
          {/* PANEL 1: BARS LIST */}
          <section className="grid min-h-0 grid-rows-[auto_1fr] border border-[#46533b] bg-black/20">
            <div className="border-b border-[#46533b] px-[6%] py-[3%] text-[clamp(9px,0.72vw,11px)] tracking-[0.14em] text-[#91a477]">BARS</div>
            <div className="grid content-start overflow-hidden">
              {visibleBars.map((idx) => {
                const ts = tsAtBar(idx);
                const isSelected = idx === selectedBar;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedBar(idx)}
                    className={`grid grid-cols-[28px_1fr_auto] gap-[8px] px-[6%] py-[3%] text-left text-[clamp(9px,0.72vw,11px)] tracking-[0.12em] ${
                      isSelected ? "bg-amber-200/15 text-amber-100" : "text-[#d8e3b7]"
                    }`}
                  >
                    <span>{isSelected ? ">" : " "}</span>
                    <span>BAR {String(idx + 1).padStart(3, "0")}</span>
                    <span className="text-[#91a477]">{ts.num}/{ts.den}</span>
                  </button>
                );
              })}
              {barCount > 12 && (
                <div className="px-[6%] py-[3%] text-[clamp(8px,0.66vw,10px)] tracking-[0.12em] text-[#46533b]">
                  ({window_start + 1}–{window_end} of {barCount})
                </div>
              )}
            </div>
          </section>

          {/* PANEL 2: SELECTED BAR DETAILS */}
          <section className="grid content-start gap-[8px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">SELECTED BAR</p>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">BAR</span><span className="text-[#eef6d8]">{String(selectedBar + 1).padStart(3, "0")}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">TIME SIG</span><span className="text-[#eef6d8]">{selectedTs.num}/{selectedTs.den}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">STEPS (1/16)</span><span className="text-[#eef6d8]">{selectedSteps}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">EVENTS</span><span className="text-[#eef6d8]">{selectedEvents}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">TEMPO</span><span className="text-[#eef6d8]">{bpm.toFixed(2)} BPM</span></div>
            <div className="mt-[6%] grid grid-cols-[28px_28px] gap-[6px]">
              <button type="button" onClick={() => setSelectedBar(Math.max(0, selectedBar - 1))} className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]">&lt;</button>
              <button type="button" onClick={() => setSelectedBar(Math.min(barCount - 1, selectedBar + 1))} className="border border-[#46533b] bg-black/30 text-center text-[#d8e3b7]">&gt;</button>
            </div>
          </section>

          {/* PANEL 3: ACTION SETTINGS */}
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">ACTION</p>
            <p className="text-amber-100 text-[clamp(13px,1vw,16px)]">{ACTION_LABELS[action]}</p>
            {action === "EDIT_TS" && (
              <>
                <ArrowRow
                  label="NUM"
                  value={String(editNum)}
                  onPrev={() => adjustNum(-1)}
                  onNext={() => adjustNum(1)}
                  editable={{ numericValue: editNum, min: 1, max: 31, onCommit: (v) => setEditNum(Math.round(v)) }}
                />
                <ArrowRow label="DEN" value={String(editDen)} onPrev={() => adjustDen(-1)} onNext={() => adjustDen(1)} />
                <p className="text-[#91a477]">PREVIEW: {editNum}/{editDen}</p>
              </>
            )}
            {action === "INSERT" && (
              <>
                <ArrowRow
                  label="COUNT"
                  value={String(insertCount)}
                  onPrev={() => setInsertCount((p) => Math.max(1, p - 1))}
                  onNext={() => setInsertCount((p) => Math.min(99, p + 1))}
                  editable={{ numericValue: insertCount, min: 1, max: 99, onCommit: (v) => setInsertCount(Math.round(v)) }}
                />
                <ArrowRow
                  label="NUM"
                  value={String(editNum)}
                  onPrev={() => adjustNum(-1)}
                  onNext={() => adjustNum(1)}
                  editable={{ numericValue: editNum, min: 1, max: 31, onCommit: (v) => setEditNum(Math.round(v)) }}
                />
                <ArrowRow label="DEN" value={String(editDen)} onPrev={() => adjustDen(-1)} onNext={() => adjustDen(1)} />
                <p className="text-[#91a477]">INSERT BEFORE BAR {String(selectedBar + 1).padStart(3, "0")}</p>
              </>
            )}
            {action === "DELETE" && (
              <>
                <ArrowRow label="FIRST BAR" value={String(deleteFirst + 1).padStart(3, "0")} onPrev={() => setDeleteFirst((p) => Math.max(0, p - 1))} onNext={() => setDeleteFirst((p) => Math.min(deleteLast, p + 1))} />
                <ArrowRow label="LAST BAR" value={String(deleteLast + 1).padStart(3, "0")} onPrev={() => setDeleteLast((p) => Math.max(deleteFirst, p - 1))} onNext={() => setDeleteLast((p) => Math.min(barCount - 1, p + 1))} />
                <p className="text-[#91a477]">EVENTS TO REMOVE: {stepEvents.filter((evt) => {
                  const b = Number(evt.step.split(".")[0]);
                  return b >= deleteFirst + 1 && b <= deleteLast + 1;
                }).length}</p>
              </>
            )}
            {action === "COPY" && (
              <>
                <ArrowRow
                  label="FROM SEQ"
                  value={copyFromSeqId || "—"}
                  onPrev={() => setCopyFromSeqId((p) => cycleSeqId(p || currentSequence, -1))}
                  onNext={() => setCopyFromSeqId((p) => cycleSeqId(p || currentSequence, 1))}
                />
                <ArrowRow
                  label="FIRST BAR"
                  value={String(copyFirstBar + 1).padStart(3, "0")}
                  onPrev={() => setCopyFirstBar((p) => Math.max(0, p - 1))}
                  onNext={() => setCopyFirstBar((p) => Math.min(copyLastBar, p + 1))}
                />
                <ArrowRow
                  label="LAST BAR"
                  value={String(copyLastBar + 1).padStart(3, "0")}
                  onPrev={() => setCopyLastBar((p) => Math.max(copyFirstBar, p - 1))}
                  onNext={() => setCopyLastBar((p) => Math.min(seqBarCount(copyFromSeqId) - 1, p + 1))}
                />
                <ArrowRow
                  label="TO SEQ"
                  value={copyToSeqId || "—"}
                  onPrev={() => setCopyToSeqId((p) => cycleSeqId(p || currentSequence, -1))}
                  onNext={() => setCopyToSeqId((p) => cycleSeqId(p || currentSequence, 1))}
                />
                <ArrowRow
                  label="BEFORE BAR"
                  value={String(copyBeforeBar + 1).padStart(3, "0")}
                  onPrev={() => setCopyBeforeBar((p) => Math.max(0, p - 1))}
                  onNext={() => setCopyBeforeBar((p) => Math.min(seqBarCount(copyToSeqId), p + 1))}
                />
                <ArrowRow
                  label="COPIES"
                  value={String(copyCount)}
                  onPrev={() => setCopyCount((p) => Math.max(1, p - 1))}
                  onNext={() => setCopyCount((p) => Math.min(99, p + 1))}
                  editable={{ numericValue: copyCount, min: 1, max: 99, onCommit: (v) => setCopyCount(Math.round(v)) }}
                />
                <p className="text-[#91a477] text-[clamp(9px,0.74vw,11px)]">
                  {copyLastBar - copyFirstBar + 1} bar(s) × {copyCount} = +{(copyLastBar - copyFirstBar + 1) * copyCount} bars
                </p>
              </>
            )}
            {action === "VIEW" && (
              <p className="text-[#46533b] text-[clamp(9px,0.74vw,11px)]">Browse bars with UP/DOWN. Press F1 ACTION to enable edits.</p>
            )}
          </section>
        </div>,
        [
          { label: "F1 ACTION", onClick: cycleAction },
          "F2 —",
          "F3 —",
          "F4 —",
          { label: "F5 DO IT", onClick: action === "VIEW" ? undefined : doIt },
          { label: "F6 EXIT", onClick: closeBarEditor },
        ],
        closeBarEditor,
      )}
    </ScreenFrame>
  );
}

// ============================================================================
// FX SCREEN — 4 FX buses + master EQ/Comp (MPC5000 routing model)
// ============================================================================

const FX_EFFECT_CYCLE: Array<null | "REVERB" | "DELAY" | "EQ" | "FLANGER" | "CHORUS" | "BITCRUSHER" | "COMPRESSOR" | "PHASER"> = [
  null, "REVERB", "DELAY", "EQ", "FLANGER", "CHORUS", "BITCRUSHER", "COMPRESSOR", "PHASER",
];

const FX_EFFECT_LABEL: Record<string, string> = {
  REVERB: "REVERB",
  DELAY: "DELAY",
  EQ: "EQ",
  FLANGER: "FLANGER",
  CHORUS: "CHORUS",
  BITCRUSHER: "BITCRUSH",
  PHASER: "PHASER",
  COMPRESSOR: "COMP",
};

// Per-effect parameter metadata: key, display label, mouse-arrow step, optional
// formatter, AND keyboard-typing range/decimal config (used by EditableNumber).
// Ranges match the canonical clamps inside fxEngine.ts so the engine and UI agree.
type FxParamSpec = {
  key: string;
  label: string;
  step: number;
  min: number;
  max: number;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  format?: (v: number) => string;
  /** When set, the param is treated as a discrete enum: PREV/NEXT cycle
   *  through this list, typed input snaps to the nearest entry. Used for
   *  musical division-style params (e.g. BitCrusher SR REDUCE). */
  enumValues?: readonly number[];
};

const EFFECT_PARAM_KEYS: Record<string, FxParamSpec[]> = {
  REVERB: [
    { key: "size", label: "SIZE", step: 1, min: 0, max: 100 },
    { key: "damping", label: "DAMP", step: 1, min: 0, max: 100 },
    { key: "diffusion", label: "DIFFUSE", step: 1, min: 0, max: 100 },
    { key: "wetDry", label: "WET/DRY", step: 1, min: 0, max: 100 },
    { key: "preDelay", label: "PREDELAY", step: 1, min: 0, max: 200, format: (v) => `${v}ms` },
    { key: "hpCut", label: "HP CUT", step: 50, min: 20, max: 20000, format: (v) => `${v}Hz` },
    { key: "lpCut", label: "LP CUT", step: 100, min: 20, max: 20000, format: (v) => `${v}Hz` },
  ],
  DELAY: [
    {
      key: "mode",
      label: "MODE",
      step: 1,
      min: 0,
      max: 2,
      enumValues: [0, 1, 2] as const,
      format: (v) => (v === 2 ? "PING-PONG" : v === 1 ? "STEREO" : "MONO"),
    },
    {
      key: "sync",
      label: "SYNC",
      step: 1,
      min: 0,
      max: 6,
      enumValues: [0, 1, 2, 3, 4, 5, 6] as const,
      format: (v) => {
        const labels = ["FREE", "1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"];
        return labels[v] ?? "FREE";
      },
    },
    { key: "timeMs", label: "TIME", step: 10, min: 1, max: 2000, format: (v) => `${v}ms` },
    { key: "feedback", label: "FEEDBACK", step: 1, min: 0, max: 95 },
    { key: "tone", label: "TONE", step: 200, min: 200, max: 20000, format: (v) => `${v}Hz` },
    { key: "drive", label: "DRIVE", step: 1, min: 0, max: 100, format: (v) => `${v}%` },
    { key: "wetDry", label: "WET/DRY", step: 1, min: 0, max: 100 },
    { key: "hpCut", label: "HP CUT", step: 50, min: 20, max: 20000, format: (v) => `${v}Hz` },
  ],
  EQ: [
    { key: "lowGain", label: "LOW GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v) => `${v.toFixed(1)}dB` },
    { key: "lowFreq", label: "LOW FREQ", step: 10, min: 20, max: 20000, format: (v) => `${v}Hz` },
    { key: "lowMidGain", label: "LMID GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v) => `${v.toFixed(1)}dB` },
    { key: "lowMidFreq", label: "LMID FREQ", step: 50, min: 20, max: 20000, format: (v) => `${v}Hz` },
    { key: "highMidGain", label: "HMID GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v) => `${v.toFixed(1)}dB` },
    { key: "highMidFreq", label: "HMID FREQ", step: 100, min: 20, max: 20000, format: (v) => `${v}Hz` },
    { key: "highGain", label: "HIGH GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v) => `${v.toFixed(1)}dB` },
    { key: "highFreq", label: "HIGH FREQ", step: 200, min: 20, max: 20000, format: (v) => `${v}Hz` },
  ],
  FLANGER: [
    { key: "rate", label: "RATE", step: 0.1, min: 0.05, max: 10, allowDecimal: true, format: (v) => `${v.toFixed(1)}Hz` },
    { key: "depth", label: "DEPTH", step: 1, min: 0, max: 100 },
    { key: "manual", label: "MANUAL", step: 1, min: 0, max: 100, format: (v) => `${v}%` },
    { key: "feedback", label: "FEEDBACK", step: 1, min: -95, max: 95, allowNegative: true },
    { key: "wetDry", label: "WET/DRY", step: 1, min: 0, max: 100 },
  ],
  CHORUS: [
    { key: "rate", label: "RATE", step: 0.1, min: 0.05, max: 5, allowDecimal: true, format: (v) => `${v.toFixed(1)}Hz` },
    { key: "depth", label: "DEPTH", step: 1, min: 0, max: 100 },
    {
      key: "voices",
      label: "VOICES",
      step: 1,
      min: 2,
      max: 4,
      enumValues: [2, 3, 4] as const,
    },
    { key: "width", label: "WIDTH", step: 1, min: 0, max: 100 },
    { key: "mix", label: "MIX", step: 1, min: 0, max: 100 },
  ],
  BITCRUSHER: [
    { key: "bits", label: "BITS", step: 1, min: 1, max: 16 },
    {
      key: "srReduce",
      label: "SR REDUCE",
      step: 1, // unused when enumValues set; PREV/NEXT cycles the enum instead
      min: 1,
      max: 64,
      enumValues: [1, 2, 4, 8, 16, 32, 64] as const,
      format: (v) => `1/${v}`,
    },
    { key: "drive", label: "DRIVE", step: 1, min: 0, max: 100, format: (v) => `${v}%` },
    { key: "wetDry", label: "WET/DRY", step: 1, min: 0, max: 100 },
  ],
  COMPRESSOR: [
    { key: "threshold", label: "THRESHOLD", step: 1, min: -60, max: 0, allowDecimal: true, allowNegative: true, format: (v) => `${v}dB` },
    { key: "ratio", label: "RATIO", step: 0.5, min: 1, max: 20, allowDecimal: true, format: (v) => `${v.toFixed(1)}:1` },
    { key: "attack", label: "ATTACK", step: 1, min: 0, max: 1000, format: (v) => `${v}ms` },
    { key: "release", label: "RELEASE", step: 5, min: 1, max: 1000, format: (v) => `${v}ms` },
    { key: "makeupGain", label: "MAKEUP", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v) => `${v.toFixed(1)}dB` },
  ],
  PHASER: [
    { key: "rate", label: "RATE", step: 0.1, min: 0.05, max: 10, allowDecimal: true, format: (v) => `${v.toFixed(1)}Hz` },
    { key: "depth", label: "DEPTH", step: 1, min: 0, max: 100 },
    {
      key: "stages",
      label: "STAGES",
      step: 1,
      min: 2,
      max: 8,
      enumValues: [2, 4, 6, 8] as const,
    },
    { key: "feedback", label: "FEEDBACK", step: 1, min: 0, max: 95 },
    { key: "wetDry", label: "WET/DRY", step: 1, min: 0, max: 100 },
  ],
};

const MASTER_EQ_PARAMS: FxParamSpec[] = [
  { key: "lowGain", label: "LOW GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v: number) => `${v.toFixed(1)}dB` },
  { key: "lowFreq", label: "LOW FREQ", step: 10, min: 20, max: 20000, format: (v: number) => `${v}Hz` },
  { key: "lowMidGain", label: "LMID GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v: number) => `${v.toFixed(1)}dB` },
  { key: "lowMidFreq", label: "LMID FREQ", step: 50, min: 20, max: 20000, format: (v: number) => `${v}Hz` },
  { key: "highMidGain", label: "HMID GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v: number) => `${v.toFixed(1)}dB` },
  { key: "highMidFreq", label: "HMID FREQ", step: 100, min: 20, max: 20000, format: (v: number) => `${v}Hz` },
  { key: "highGain", label: "HIGH GAIN", step: 0.5, min: -24, max: 24, allowDecimal: true, allowNegative: true, format: (v: number) => `${v.toFixed(1)}dB` },
  { key: "highFreq", label: "HIGH FREQ", step: 200, min: 20, max: 20000, format: (v: number) => `${v}Hz` },
];

// Master COMP makeupGain is positive-only (engine clamps 0..24) — distinct from bus comp makeup.
const MASTER_COMP_PARAMS: FxParamSpec[] = [
  { key: "threshold", label: "THRESHOLD", step: 1, min: -60, max: 0, allowDecimal: true, allowNegative: true, format: (v: number) => `${v}dB` },
  { key: "ratio", label: "RATIO", step: 0.5, min: 1, max: 20, allowDecimal: true, format: (v: number) => `${v.toFixed(1)}:1` },
  { key: "attack", label: "ATTACK", step: 1, min: 0, max: 1000, format: (v: number) => `${v}ms` },
  { key: "release", label: "RELEASE", step: 5, min: 1, max: 1000, format: (v: number) => `${v}ms` },
  { key: "makeupGain", label: "MAKEUP", step: 0.5, min: 0, max: 24, allowDecimal: true, format: (v: number) => `${v.toFixed(1)}dB` },
];

type FxSelection =
  | { kind: "bus-block"; busId: 1 | 2 | 3 | 4; block: "A" | "B" }
  | { kind: "master-eq" }
  | { kind: "master-comp" };

export function FxScreen() {
  const fxBuses = useAppStore((s) => s.fxBuses);
  const masterFx = useAppStore((s) => s.masterFx);
  const chainFX1ToFX2 = useAppStore((s) => s.fxChainFX1ToFX2);
  const chainFX3ToFX4 = useAppStore((s) => s.fxChainFX3ToFX4);
  const setFxBusBlockEffect = useAppStore((s) => s.setFxBusBlockEffect);
  const toggleFxBusBlockBypass = useAppStore((s) => s.toggleFxBusBlockBypass);
  const adjustFxBusBlockParam = useAppStore((s) => s.adjustFxBusBlockParam);
  const setFxBusBlockParam = useAppStore((s) => s.setFxBusBlockParam);
  const toggleFxBusDirect = useAppStore((s) => s.toggleFxBusDirect);
  const toggleFxChain = useAppStore((s) => s.toggleFxChain);
  const resetBusBlock = useAppStore((s) => s.resetBusBlock);
  const toggleMasterEqBypass = useAppStore((s) => s.toggleMasterEqBypass);
  const toggleMasterCompBypass = useAppStore((s) => s.toggleMasterCompBypass);
  const adjustMasterEqParam = useAppStore((s) => s.adjustMasterEqParam);
  const setMasterEqParam = useAppStore((s) => s.setMasterEqParam);
  const adjustMasterCompParam = useAppStore((s) => s.adjustMasterCompParam);
  const setMasterCompParam = useAppStore((s) => s.setMasterCompParam);
  const resetMasterEq = useAppStore((s) => s.resetMasterEq);
  const resetMasterComp = useAppStore((s) => s.resetMasterComp);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);

  const [selection, setSelection] = useState<FxSelection>({ kind: "bus-block", busId: 1, block: "A" });

  const exit = () => setActiveScreen("MAIN");

  const selectedBus = selection.kind === "bus-block" ? fxBuses.find((b) => b.id === selection.busId) ?? null : null;
  const selectedBlock = selectedBus && selection.kind === "bus-block"
    ? (selection.block === "A" ? selectedBus.blockA : selectedBus.blockB)
    : null;

  const cycleBlockEffect = (busId: 1 | 2 | 3 | 4, block: "A" | "B", dir: 1 | -1) => {
    const bus = fxBuses.find((b) => b.id === busId);
    if (!bus) return;
    const blk = block === "A" ? bus.blockA : bus.blockB;
    const i = FX_EFFECT_CYCLE.indexOf(blk.effect ?? null);
    const next = FX_EFFECT_CYCLE[(i + dir + FX_EFFECT_CYCLE.length) % FX_EFFECT_CYCLE.length];
    setFxBusBlockEffect(busId, block, next);
  };

  const handleF4Reset = () => {
    if (selection.kind === "bus-block") {
      const bus = fxBuses.find((b) => b.id === selection.busId);
      if (!bus) return;
      const blk = selection.block === "A" ? bus.blockA : bus.blockB;
      const effectLabel = blk.effect ? FX_EFFECT_LABEL[blk.effect] : "OFF";
      if (!blk.effect) {
        window.alert(`FX${selection.busId} Block ${selection.block} has no effect to reset.`);
        return;
      }
      if (window.confirm(`Reset ${effectLabel} params on FX${selection.busId} Block ${selection.block}?`)) {
        resetBusBlock(selection.busId, selection.block);
      }
    } else if (selection.kind === "master-eq") {
      if (window.confirm("Reset Master EQ params to defaults?")) resetMasterEq();
    } else {
      if (window.confirm("Reset Master Compressor params to defaults?")) resetMasterComp();
    }
  };

  const handleF5Bypass = () => {
    if (selection.kind === "bus-block") {
      toggleFxBusBlockBypass(selection.busId, selection.block);
    } else if (selection.kind === "master-eq") {
      toggleMasterEqBypass();
    } else {
      toggleMasterCompBypass();
    }
  };

  const handleF2BlockSwap = () => {
    if (selection.kind === "bus-block") {
      setSelection({ kind: "bus-block", busId: selection.busId, block: selection.block === "A" ? "B" : "A" });
    }
  };

  const handleF1Effect = () => {
    if (selection.kind === "bus-block") cycleBlockEffect(selection.busId, selection.block, 1);
  };

  const handleF3Direct = () => {
    if (selection.kind === "bus-block") toggleFxBusDirect(selection.busId);
  };

  return (
    <ScreenFrame title="FX" subtitle="4 BUSES (2 BLOCKS) + MASTER + CHAINING">
      {shell(
        <div className="grid h-full grid-cols-[1.05fr_1.1fr_1.6fr] gap-[1.6%]">
          {/* PANEL 1 — Bus list (expanded with Block A/B + chain indicators) + Master */}
          <section className="grid min-h-0 content-start gap-[4px] overflow-auto border border-[#46533b] bg-black/20 p-[3%] text-[clamp(8px,0.7vw,11px)] tracking-[0.1em]">
            <p className="text-[#91a477]">BUSES</p>
            {fxBuses.map((bus, idx) => {
              const isFx1 = bus.id === 1;
              const isFx3 = bus.id === 3;
              const chainBelow = (isFx1 && chainFX1ToFX2) || (isFx3 && chainFX3ToFX4);
              const showChainAfter = bus.id === 1 || bus.id === 3;
              return (
                <div key={bus.id} className="grid gap-[2px]">
                  <div className={`grid grid-cols-[1fr_auto] items-center px-[4px] text-[#91a477] text-[clamp(8px,0.7vw,10px)] ${idx > 0 ? "mt-[4px]" : ""}`}>
                    <span>FX{bus.id}</span>
                    <span>{bus.direct ? "SEND" : "INSERT"}</span>
                  </div>
                  {(["A", "B"] as const).map((blockKey) => {
                    const blk = blockKey === "A" ? bus.blockA : bus.blockB;
                    const isSel = selection.kind === "bus-block" && selection.busId === bus.id && selection.block === blockKey;
                    const label = blk.effect ? FX_EFFECT_LABEL[blk.effect] : "OFF";
                    return (
                      <button
                        key={blockKey}
                        type="button"
                        onClick={() => setSelection({ kind: "bus-block", busId: bus.id as 1 | 2 | 3 | 4, block: blockKey })}
                        className={`grid grid-cols-[auto_auto_1fr_auto] items-center gap-[4px] border px-[6px] py-[3px] text-left ${
                          isSel ? "border-amber-100 bg-amber-100/10 text-amber-100" : "border-[#46533b] text-[#d8e3b7]"
                        } ${blk.bypass ? "opacity-50" : ""}`}
                      >
                        <span>{isSel ? ">" : " "}</span>
                        <span className="text-[#91a477]">{blockKey}:</span>
                        <span>{label}</span>
                        {blk.bypass ? <span className="text-[#91a477]">BYP</span> : <span />}
                      </button>
                    );
                  })}
                  {showChainAfter ? (
                    <button
                      type="button"
                      onClick={() => toggleFxChain(isFx1 ? "FX1_FX2" : "FX3_FX4")}
                      className={`grid grid-cols-[auto_1fr_auto] items-center gap-[4px] px-[6px] py-[2px] text-[clamp(7px,0.6vw,9px)] ${
                        chainBelow ? "text-amber-200" : "text-[#91a477]"
                      } hover:bg-black/30`}
                    >
                      <span>{chainBelow ? "↓" : " "}</span>
                      <span className="text-center">FX{bus.id}{">"} FX{bus.id + 1}</span>
                      <span>{chainBelow ? "ON" : "OFF"}</span>
                    </button>
                  ) : null}
                </div>
              );
            })}
            <p className="mt-[8%] text-[#91a477]">MASTER</p>
            <button
              type="button"
              onClick={() => setSelection({ kind: "master-eq" })}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-[4px] border px-[6px] py-[3px] text-left ${
                selection.kind === "master-eq" ? "border-amber-100 bg-amber-100/10 text-amber-100" : "border-[#46533b] text-[#d8e3b7]"
              } ${masterFx.eq.bypass ? "opacity-50" : ""}`}
            >
              <span>{selection.kind === "master-eq" ? ">" : " "}</span>
              <span>EQ</span>
              <span className="text-[#91a477]">{masterFx.eq.bypass ? "BYP" : "ON"}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelection({ kind: "master-comp" })}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-[4px] border px-[6px] py-[3px] text-left ${
                selection.kind === "master-comp" ? "border-amber-100 bg-amber-100/10 text-amber-100" : "border-[#46533b] text-[#d8e3b7]"
              } ${masterFx.compressor.bypass ? "opacity-50" : ""}`}
            >
              <span>{selection.kind === "master-comp" ? ">" : " "}</span>
              <span>COMP</span>
              <span className="text-[#91a477]">{masterFx.compressor.bypass ? "BYP" : "ON"}</span>
            </button>
          </section>

          {/* PANEL 2 — Selected bus/block details + actions */}
          <section className="grid min-h-0 content-start gap-[8px] overflow-auto border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.82vw,13px)] tracking-[0.12em]">
            {selection.kind === "bus-block" && selectedBus && selectedBlock ? (
              <>
                <p className="text-[#91a477]">SELECTED BUS / BLOCK</p>
                <div className="grid grid-cols-[1fr_auto]"><span>BUS</span><span className="text-[#eef6d8]">FX{selectedBus.id}</span></div>
                <div className="grid grid-cols-[1fr_auto]"><span>BLOCK</span><span className="text-[#eef6d8]">{selection.block}</span></div>
                <div className="grid grid-cols-[1fr_auto]"><span>EFFECT</span><span className="text-[#eef6d8]">{selectedBlock.effect ? FX_EFFECT_LABEL[selectedBlock.effect] : "OFF"}</span></div>
                <div className="grid grid-cols-[1fr_auto]"><span>MODE</span><span className="text-[#eef6d8]">{selectedBus.direct ? "SEND" : "INSERT"}</span></div>
                <div className="grid grid-cols-[1fr_auto]"><span>BLOCK A</span><span className="text-[#eef6d8]">{selectedBus.blockA.effect ? FX_EFFECT_LABEL[selectedBus.blockA.effect] : "OFF"}{selectedBus.blockA.bypass ? " (BYP)" : ""}</span></div>
                <div className="grid grid-cols-[1fr_auto]"><span>BLOCK B</span><span className="text-[#eef6d8]">{selectedBus.blockB.effect ? FX_EFFECT_LABEL[selectedBus.blockB.effect] : "OFF"}{selectedBus.blockB.bypass ? " (BYP)" : ""}</span></div>
                <p className="mt-[4%] text-[#91a477]">ACTIONS</p>
                <ArrowRow
                  label="EFFECT"
                  value={selectedBlock.effect ? FX_EFFECT_LABEL[selectedBlock.effect] : "OFF"}
                  onPrev={() => cycleBlockEffect(selectedBus.id, selection.block, -1)}
                  onNext={() => cycleBlockEffect(selectedBus.id, selection.block, 1)}
                />
                <button type="button" onClick={handleF2BlockSwap} className="border border-[#46533b] bg-black/30 px-[6px] py-[4px] text-[#d8e3b7]">
                  BLOCK: {selection.block} (swap)
                </button>
                <button type="button" onClick={() => toggleFxBusDirect(selectedBus.id)} className="border border-[#46533b] bg-black/30 px-[6px] py-[4px] text-[#d8e3b7]">
                  DIRECT: {selectedBus.direct ? "ON (SEND)" : "OFF (INSERT)"}
                </button>
                <button type="button" onClick={() => toggleFxBusBlockBypass(selectedBus.id, selection.block)} className="border border-[#46533b] bg-black/30 px-[6px] py-[4px] text-[#d8e3b7]">
                  BYPASS BLOCK {selection.block}: {selectedBlock.bypass ? "ON" : "OFF"}
                </button>
              </>
            ) : selection.kind === "master-eq" ? (
              <>
                <p className="text-[#91a477]">MASTER EQ</p>
                <p>4-band parametric, last in chain.</p>
                <button type="button" onClick={toggleMasterEqBypass} className="border border-[#46533b] bg-black/30 px-[6px] py-[4px] text-[#d8e3b7]">
                  BYPASS: {masterFx.eq.bypass ? "ON" : "OFF"}
                </button>
              </>
            ) : (
              <>
                <p className="text-[#91a477]">MASTER COMP</p>
                <p>Dynamics + makeup gain, last in chain.</p>
                <button type="button" onClick={toggleMasterCompBypass} className="border border-[#46533b] bg-black/30 px-[6px] py-[4px] text-[#d8e3b7]">
                  BYPASS: {masterFx.compressor.bypass ? "ON" : "OFF"}
                </button>
              </>
            )}
          </section>

          {/* PANEL 3 — Effect parameters for the selected block / master section */}
          <section className="grid min-h-0 content-start gap-[6px] overflow-auto border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.78vw,12px)] tracking-[0.12em]">
            <p className="text-[#91a477]">PARAMETERS</p>
            {selection.kind === "bus-block" && selectedBus && selectedBlock ? (
              selectedBlock.effect ? (
                EFFECT_PARAM_KEYS[selectedBlock.effect].map((spec) => {
                  const { key, label, step, min, max, allowDecimal, allowNegative, format, enumValues } = spec;
                  const value = selectedBlock.params[key] ?? 0;
                  // Enum-mode PREV/NEXT: cycle through the discrete list
                  // instead of nudging by step. Typed commit (if allowed)
                  // snaps to the nearest entry.
                  const enumCycle = (direction: 1 | -1) => {
                    if (!enumValues) return;
                    const idx = enumValues.indexOf(value);
                    const len = enumValues.length;
                    const nextIdx = idx >= 0
                      ? (idx + direction + len) % len
                      : direction === 1 ? 0 : len - 1;
                    setFxBusBlockParam(selectedBus.id, selection.block, key, enumValues[nextIdx]);
                  };
                  const snapToEnum = (raw: number): number => {
                    if (!enumValues) return raw;
                    let best = enumValues[0];
                    let bestDist = Math.abs(raw - best);
                    for (const ev of enumValues) {
                      const d = Math.abs(raw - ev);
                      if (d < bestDist) { best = ev; bestDist = d; }
                    }
                    return best;
                  };
                  return (
                    <ArrowRow
                      key={key}
                      label={label}
                      value={format ? format(value) : String(value)}
                      onPrev={() =>
                        enumValues
                          ? enumCycle(-1)
                          : adjustFxBusBlockParam(selectedBus.id, selection.block, key, -step)
                      }
                      onNext={() =>
                        enumValues
                          ? enumCycle(1)
                          : adjustFxBusBlockParam(selectedBus.id, selection.block, key, step)
                      }
                      editable={{
                        numericValue: value,
                        format,
                        min,
                        max,
                        allowDecimal,
                        allowNegative,
                        onCommit: (v) =>
                          setFxBusBlockParam(
                            selectedBus.id,
                            selection.block,
                            key,
                            enumValues ? snapToEnum(v) : v,
                          ),
                      }}
                    />
                  );
                })
              ) : (
                <p className="text-[#91a477]">No effect assigned. Use EFFECT &lt; &gt; in middle panel.</p>
              )
            ) : selection.kind === "master-eq" ? (
              MASTER_EQ_PARAMS.map((spec) => {
                const { key, label, step, min, max, allowDecimal, allowNegative, format } = spec;
                const value = masterFx.eq.params[key] ?? 0;
                return (
                  <ArrowRow
                    key={key}
                    label={label}
                    value={format ? format(value) : String(value)}
                    onPrev={() => adjustMasterEqParam(key, -step)}
                    onNext={() => adjustMasterEqParam(key, step)}
                    editable={{
                      numericValue: value,
                      format,
                      min,
                      max,
                      allowDecimal,
                      allowNegative,
                      onCommit: (v) => setMasterEqParam(key, v),
                    }}
                  />
                );
              })
            ) : (
              MASTER_COMP_PARAMS.map((spec) => {
                const { key, label, step, min, max, allowDecimal, allowNegative, format } = spec;
                const value = masterFx.compressor.params[key] ?? 0;
                return (
                  <ArrowRow
                    key={key}
                    label={label}
                    value={format ? format(value) : String(value)}
                    onPrev={() => adjustMasterCompParam(key, -step)}
                    onNext={() => adjustMasterCompParam(key, step)}
                    editable={{
                      numericValue: value,
                      format,
                      min,
                      max,
                      allowDecimal,
                      allowNegative,
                      onCommit: (v) => setMasterCompParam(key, v),
                    }}
                  />
                );
              })
            )}
          </section>
        </div>,
        [
          { label: "F1 EFFECT", onClick: handleF1Effect },
          { label: "F2 BLOCK", onClick: selection.kind === "bus-block" ? handleF2BlockSwap : undefined },
          { label: "F3 DIRECT", onClick: selection.kind === "bus-block" ? handleF3Direct : undefined },
          { label: "F4 RESET", onClick: handleF4Reset },
          { label: "F5 BYPASS", onClick: handleF5Bypass },
          { label: "F6 EXIT", onClick: exit },
        ],
        exit,
      )}
    </ScreenFrame>
  );
}

export function FxSendWindowScreen() {
  const padBank = useAppStore((s) => s.padBank);
  const selectedPad = useAppStore((s) => s.selectedPad);
  const padAssignments = useAppStore((s) => s.padAssignments);
  const fxBuses = useAppStore((s) => s.fxBuses);
  const setPadFxBus = useAppStore((s) => s.setPadFxBus);
  const adjustPadFxSendLevel = useAppStore((s) => s.adjustPadFxSendLevel);
  const setPadFxSendLevel = useAppStore((s) => s.setPadFxSendLevel);
  const closeFxSendWindow = useAppStore((s) => s.closeFxSendWindow);

  const assignment = padAssignments[padBank].find((a) => a.pad === selectedPad);
  const busId = assignment?.fxBus ?? 0;
  const sendLevel = assignment?.fxSendLevel ?? 0;
  const targetBus = busId === 0 ? null : fxBuses.find((b) => b.id === busId);
  const sendDisabled = !targetBus || !targetBus.direct;
  const padLabel = `${padBank}${selectedPad.slice(1)}`;
  const busBlocksSummary = (() => {
    if (!targetBus) return "---";
    const a = targetBus.blockA.effect ? FX_EFFECT_LABEL[targetBus.blockA.effect] : "OFF";
    const b = targetBus.blockB.effect ? FX_EFFECT_LABEL[targetBus.blockB.effect] : "OFF";
    return `A:${a} / B:${b}`;
  })();

  const cycleBus = (dir: 1 | -1) => {
    const cur = busId;
    const next = ((cur + dir + 5) % 5) as 0 | 1 | 2 | 3 | 4;
    setPadFxBus(selectedPad, next);
  };
  const adjustSend = (delta: number) => {
    if (sendDisabled) return;
    adjustPadFxSendLevel(selectedPad, delta);
  };

  return (
    <ScreenFrame title="FX SEND" subtitle={`Pad ${padLabel}`}>
      {shell(
        <div className="grid h-full grid-cols-[1fr_1fr] gap-[2.3%]">
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(11px,0.9vw,14px)] tracking-[0.14em]">
            <p className="text-[#91a477]">ROUTING</p>
            <ArrowRow
              label="FX BUS"
              value={busId === 0 ? "OFF" : `FX${busId}`}
              onPrev={() => cycleBus(-1)}
              onNext={() => cycleBus(1)}
            />
            <ArrowRow
              label="SEND LEVEL"
              value={sendDisabled ? "---" : `${sendLevel}`}
              onPrev={() => adjustSend(-1)}
              onNext={() => adjustSend(1)}
              editable={sendDisabled ? undefined : {
                numericValue: sendLevel,
                min: 0,
                max: 100,
                onCommit: (v) => setPadFxSendLevel(selectedPad, Math.round(v)),
              }}
            />
            {sendDisabled && busId !== 0 ? (
              <p className="text-[#91a477] text-[clamp(9px,0.7vw,11px)]">Bus is INSERT mode — send disabled.</p>
            ) : null}
          </section>
          <section className="grid content-start gap-[6px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">CONTEXT</p>
            <div className="grid grid-cols-[1fr_auto]"><span>PAD</span><span className="text-[#eef6d8]">{padLabel}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span>BUS</span><span className="text-[#eef6d8]">{busId === 0 ? "OFF" : `FX${busId}`}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span>MODE</span><span className="text-[#eef6d8]">{targetBus ? (targetBus.direct ? "SEND" : "INSERT") : "---"}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span>BLOCKS</span><span className="text-[#eef6d8]">{busBlocksSummary}</span></div>
          </section>
        </div>,
        [
          "F1 —",
          "F2 —",
          "F3 —",
          "F4 —",
          "F5 —",
          { label: "F6 EXIT", onClick: closeFxSendWindow },
        ],
        closeFxSendWindow,
      )}
    </ScreenFrame>
  );
}

export function TimeSigWindowScreen() {
  const sequences = useAppStore((s) => s.sequences);
  const currentSequence = useAppStore((s) => s.currentSequence);
  const currentBar = useAppStore((s) => s.currentBar);
  const bpm = useAppStore((s) => s.bpm);
  const changeBarTimeSignature = useAppStore((s) => s.changeBarTimeSignature);
  const closeTimeSigWindow = useAppStore((s) => s.closeTimeSigWindow);

  const sequence = sequences.find((s) => s.id === currentSequence);
  const barIndex = Math.max(0, currentBar - 1);

  const initial = (() => {
    if (!sequence) return { num: 4, den: 4 as 4 | 8 | 16 | 32 };
    const changes = sequence.timeSignatureChanges ?? [];
    let resolved = changes[0] ?? { fromBar: 0, num: 4, den: 4 as 4 | 8 | 16 | 32 };
    for (const change of changes) {
      if (change.fromBar <= barIndex) resolved = change;
      else break;
    }
    return { num: resolved.num, den: resolved.den };
  })();

  const [num, setNum] = useState(initial.num);
  const [den, setDen] = useState<4 | 8 | 16 | 32>(initial.den);

  const cycleNum = (delta: number) => setNum((prev) => {
    const next = prev + delta;
    if (next < 1) return 1;
    if (next > 31) return 31;
    return next;
  });
  const cycleDen = (delta: number) => setDen((prev) => {
    const i = DEN_CYCLE.indexOf(prev);
    const next = (i + delta + DEN_CYCLE.length) % DEN_CYCLE.length;
    return DEN_CYCLE[next];
  });

  const doIt = () => {
    // Truncate confirm if shorter than current.
    if (sequence) {
      const oldChanges = sequence.timeSignatureChanges ?? [];
      let oldResolved = oldChanges[0];
      for (const c of oldChanges) {
        if (c && c.fromBar <= barIndex) oldResolved = c;
        else break;
      }
      const oldBarTicks = oldResolved ? Math.round((oldResolved.num * 384) / oldResolved.den) : 384;
      const newBarTicks = Math.round((num * 384) / den);
      if (newBarTicks < oldBarTicks) {
        const removed = sequence.events.filter((evt) => {
          const evBar = Number(evt.step.split(".")[0]);
          if (evBar !== barIndex + 1) return false;
          const [, beatStr, tickStr] = evt.step.split(".");
          return (Number(beatStr) - 1) * 96 + Number(tickStr) >= newBarTicks;
        }).length;
        if (removed > 0) {
          const ok = window.confirm(`Bar ${barIndex + 1} will be truncated. ${removed} events removed. Proceed?`);
          if (!ok) return;
        }
      }
    }
    changeBarTimeSignature(barIndex, num, den);
    closeTimeSigWindow();
  };

  const barLabel = String(barIndex + 1).padStart(3, "0");
  const totalBars = sequence?.lengthBars ?? 0;

  return (
    <ScreenFrame title="TIME SIGNATURE" subtitle={`Bar ${barLabel}`}>
      {shell(
        <div className="grid h-full grid-cols-[1fr_1fr] gap-[2.3%]">
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(11px,0.9vw,14px)] tracking-[0.14em]">
            <p className="text-[#91a477]">TIME SIG</p>
            <ArrowRow
              label="NUM"
              value={String(num)}
              onPrev={() => cycleNum(-1)}
              onNext={() => cycleNum(1)}
              editable={{ numericValue: num, min: 1, max: 31, onCommit: (v) => setNum(Math.round(v)) }}
            />
            <ArrowRow label="DEN" value={String(den)} onPrev={() => cycleDen(-1)} onNext={() => cycleDen(1)} />
            <p className="mt-[8%] text-[#91a477]">PREVIEW</p>
            <p className="text-[#eef6d8] text-[clamp(20px,1.6vw,28px)]">{num} / {den}</p>
          </section>
          <section className="grid content-start gap-[10px] border border-[#46533b] bg-black/20 p-[4%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">CONTEXT</p>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">BAR</span><span className="text-[#eef6d8]">{barLabel}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">TOTAL BARS</span><span className="text-[#eef6d8]">{totalBars}</span></div>
            <div className="grid grid-cols-[1fr_auto]"><span className="text-[#91a477]">TEMPO</span><span className="text-[#eef6d8]">{bpm.toFixed(2)} BPM</span></div>
          </section>
        </div>,
        [
          "F1 —",
          "F2 —",
          "F3 —",
          "F4 —",
          { label: "F5 DO IT", onClick: doIt },
          { label: "F6 EXIT", onClick: closeTimeSigWindow },
        ],
        closeTimeSigWindow,
      )}
    </ScreenFrame>
  );
}

// ============================================================================
// SAMPLE EDIT WINDOW — 8 destructive operations on the CHOP active region.
// ============================================================================

const SAMPLE_EDIT_OP_CYCLE = [
  "TIME_STRETCH",
  "PITCH_SHIFT",
  "WARP",
  "REVERSE",
  "NORMALIZE",
  "BIT_REDUCE",
  "FADE_IN",
  "FADE_OUT",
] as const;

const SAMPLE_EDIT_OP_LABEL: Record<typeof SAMPLE_EDIT_OP_CYCLE[number], string> = {
  TIME_STRETCH: "TIME STRETCH",
  PITCH_SHIFT: "PITCH SHIFT",
  WARP: "WARP / RESAMPLE",
  REVERSE: "REVERSE",
  NORMALIZE: "NORMALIZE",
  BIT_REDUCE: "BIT REDUCE",
  FADE_IN: "FADE IN",
  FADE_OUT: "FADE OUT",
};

const BIT_REDUCE_PRESET_CYCLE = ["SP-1200", "MPC60", "NES", "ATARI", "CUSTOM"] as const;
const BIT_REDUCE_PRESET_VALUES: Record<Exclude<typeof BIT_REDUCE_PRESET_CYCLE[number], "CUSTOM">, { bitDepth: number; reducedSampleRate: number }> = {
  "SP-1200": { bitDepth: 12, reducedSampleRate: 26040 },
  "MPC60": { bitDepth: 12, reducedSampleRate: 40000 },
  "NES": { bitDepth: 7, reducedSampleRate: 22050 },
  "ATARI": { bitDepth: 8, reducedSampleRate: 22050 },
};

const FADE_CURVE_CYCLE = ["LINEAR", "LOG", "EXP"] as const;
const STRETCH_MODE_CYCLE = ["RATIO", "BPM_MATCH"] as const;
const STRETCH_MODE_LABEL: Record<typeof STRETCH_MODE_CYCLE[number], string> = {
  RATIO: "RATIO",
  BPM_MATCH: "BPM MATCH",
};

export function SampleEditWindowScreen() {
  const sourceIndex = useAppStore((s) => s.sampleEditSourceIndex);
  const recordedSamples = useAppStore((s) => s.recordedSamples);
  const op = useAppStore((s) => s.sampleEditOp);
  const params = useAppStore((s) => s.sampleEditParams);
  const setSampleEditOp = useAppStore((s) => s.setSampleEditOp);
  const setSampleEditParam = useAppStore((s) => s.setSampleEditParam);
  const applySampleEdit = useAppStore((s) => s.applySampleEdit);
  const closeSampleEditWindow = useAppStore((s) => s.closeSampleEditWindow);

  const source = recordedSamples[sourceIndex] ?? recordedSamples[0];
  const sampleName = source?.name ?? "---";

  const cycleOp = (dir: 1 | -1) => {
    const i = SAMPLE_EDIT_OP_CYCLE.indexOf(op);
    const next = SAMPLE_EDIT_OP_CYCLE[(i + dir + SAMPLE_EDIT_OP_CYCLE.length) % SAMPLE_EDIT_OP_CYCLE.length];
    setSampleEditOp(next);
  };

  const doIt = () => {
    if (!source) {
      window.alert("No sample selected.");
      return;
    }
    void applySampleEdit();
  };

  return (
    <ScreenFrame title="SAMPLE EDIT" subtitle={`Sample: ${sampleName}`}>
      {shell(
        <div className="grid h-full grid-rows-[auto_1fr] gap-[10px]">
          {/* Operation selector */}
          <section className="grid grid-cols-[1fr_1fr] gap-[2.3%] border border-[#46533b] bg-black/20 p-[2.4%]">
            <div className="grid content-start gap-[6px] text-[clamp(10px,0.84vw,13px)] tracking-[0.14em]">
              <p className="text-[#91a477]">OPERATION</p>
              <ArrowRow
                label=""
                value={SAMPLE_EDIT_OP_LABEL[op]}
                onPrev={() => cycleOp(-1)}
                onNext={() => cycleOp(1)}
              />
            </div>
            <div className="grid content-start gap-[4px] text-[clamp(10px,0.78vw,12px)] tracking-[0.12em]">
              <p className="text-[#91a477]">SOURCE</p>
              <div className="grid grid-cols-[1fr_auto]"><span>SAMPLE</span><span className="text-[#eef6d8]">{sampleName}</span></div>
              <div className="grid grid-cols-[1fr_auto]"><span>LENGTH</span><span className="text-[#eef6d8]">{source ? `${source.durationMs} ms` : "---"}</span></div>
              <div className="grid grid-cols-[1fr_auto]"><span>RATE</span><span className="text-[#eef6d8]">{source ? `${source.sampleRate} Hz` : "---"}</span></div>
              <div className="grid grid-cols-[1fr_auto]"><span>CHANNELS</span><span className="text-[#eef6d8]">{source ? source.channelCount : "---"}</span></div>
            </div>
          </section>

          {/* Per-op params */}
          <section className="grid min-h-0 content-start gap-[8px] overflow-auto border border-[#46533b] bg-black/20 p-[3%] text-[clamp(10px,0.84vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477]">PARAMETERS</p>
            {renderOpParams(op, params, setSampleEditParam)}
          </section>
        </div>,
        [
          "F1 —",
          "F2 —",
          "F3 —",
          "F4 —",
          { label: "F5 DO IT", onClick: doIt },
          { label: "F6 EXIT", onClick: closeSampleEditWindow },
        ],
        closeSampleEditWindow,
      )}
    </ScreenFrame>
  );
}

type SetParamFn = <K extends keyof import("../audio/sampleEditOps").SampleEditParams>(
  key: K,
  value: import("../audio/sampleEditOps").SampleEditParams[K],
) => void;

function renderOpParams(
  op: typeof SAMPLE_EDIT_OP_CYCLE[number],
  params: import("../audio/sampleEditOps").SampleEditParams,
  setParam: SetParamFn,
): ReactNode {
  if (op === "TIME_STRETCH") {
    const mode = params.stretchMode ?? "RATIO";
    return (
      <>
        <ArrowRow
          label="MODE"
          value={STRETCH_MODE_LABEL[mode]}
          onPrev={() => setParam("stretchMode", mode === "RATIO" ? "BPM_MATCH" : "RATIO")}
          onNext={() => setParam("stretchMode", mode === "RATIO" ? "BPM_MATCH" : "RATIO")}
        />
        {mode === "RATIO" ? (
          <ArrowRow
            label="RATIO"
            value={`${params.stretchRatio ?? 100}%`}
            onPrev={() => setParam("stretchRatio", Math.max(50, (params.stretchRatio ?? 100) - 1))}
            onNext={() => setParam("stretchRatio", Math.min(200, (params.stretchRatio ?? 100) + 1))}
            editable={{ numericValue: params.stretchRatio ?? 100, format: (n) => `${n}%`, min: 50, max: 200, onCommit: (v) => setParam("stretchRatio", Math.round(v)) }}
          />
        ) : (
          <>
            <ArrowRow
              label="ORIG BPM"
              value={`${params.originalBpm ?? 120}`}
              onPrev={() => setParam("originalBpm", Math.max(30, (params.originalBpm ?? 120) - 1))}
              onNext={() => setParam("originalBpm", Math.min(300, (params.originalBpm ?? 120) + 1))}
              editable={{ numericValue: params.originalBpm ?? 120, min: 30, max: 300, onCommit: (v) => setParam("originalBpm", Math.round(v)) }}
            />
            <ArrowRow
              label="NEW BPM"
              value={`${params.newBpm ?? 120}`}
              onPrev={() => setParam("newBpm", Math.max(30, (params.newBpm ?? 120) - 1))}
              onNext={() => setParam("newBpm", Math.min(300, (params.newBpm ?? 120) + 1))}
              editable={{ numericValue: params.newBpm ?? 120, min: 30, max: 300, onCommit: (v) => setParam("newBpm", Math.round(v)) }}
            />
          </>
        )}
      </>
    );
  }
  if (op === "PITCH_SHIFT") {
    return (
      <>
        <ArrowRow
          label="SEMITONES"
          value={String(params.semitones ?? 0)}
          onPrev={() => setParam("semitones", Math.max(-12, (params.semitones ?? 0) - 1))}
          onNext={() => setParam("semitones", Math.min(12, (params.semitones ?? 0) + 1))}
          editable={{ numericValue: params.semitones ?? 0, min: -12, max: 12, allowNegative: true, onCommit: (v) => setParam("semitones", Math.round(v)) }}
        />
        <ArrowRow
          label="CENTS"
          value={String(params.cents ?? 0)}
          onPrev={() => setParam("cents", Math.max(-100, (params.cents ?? 0) - 1))}
          onNext={() => setParam("cents", Math.min(100, (params.cents ?? 0) + 1))}
          editable={{ numericValue: params.cents ?? 0, min: -100, max: 100, allowNegative: true, onCommit: (v) => setParam("cents", Math.round(v)) }}
        />
      </>
    );
  }
  if (op === "WARP") {
    return (
      <>
        <ArrowRow
          label="SPEED"
          value={`${params.warpSpeed ?? 100}%`}
          onPrev={() => setParam("warpSpeed", Math.max(50, (params.warpSpeed ?? 100) - 1))}
          onNext={() => setParam("warpSpeed", Math.min(200, (params.warpSpeed ?? 100) + 1))}
          editable={{ numericValue: params.warpSpeed ?? 100, format: (n) => `${n}%`, min: 50, max: 200, onCommit: (v) => setParam("warpSpeed", Math.round(v)) }}
        />
        <p className="text-[#91a477] text-[clamp(9px,0.72vw,11px)]">Vinyl-style: changes pitch + tempo together.</p>
      </>
    );
  }
  if (op === "REVERSE") {
    return <p className="text-[#91a477]">No parameters. Flips sample playback direction.</p>;
  }
  if (op === "NORMALIZE") {
    return (
      <ArrowRow
        label="TARGET dB"
        value={`${(params.targetDb ?? -0.3).toFixed(1)} dB`}
        onPrev={() => setParam("targetDb", Math.max(-60, (params.targetDb ?? -0.3) - 0.1))}
        onNext={() => setParam("targetDb", Math.min(0, (params.targetDb ?? -0.3) + 0.1))}
        editable={{ numericValue: params.targetDb ?? -0.3, format: (n) => `${n.toFixed(1)} dB`, min: -60, max: 0, allowDecimal: true, allowNegative: true, onCommit: (v) => setParam("targetDb", v) }}
      />
    );
  }
  if (op === "BIT_REDUCE") {
    const bits = params.bitDepth ?? 12;
    const rate = params.reducedSampleRate ?? 26040;
    // Detect preset match for display
    let presetLabel: string = "CUSTOM";
    for (const [name, vals] of Object.entries(BIT_REDUCE_PRESET_VALUES)) {
      if (vals.bitDepth === bits && vals.reducedSampleRate === rate) {
        presetLabel = name;
        break;
      }
    }
    return (
      <>
        <ArrowRow
          label="PRESET"
          value={presetLabel}
          onPrev={() => cyclePreset(presetLabel, -1, setParam)}
          onNext={() => cyclePreset(presetLabel, 1, setParam)}
        />
        <ArrowRow
          label="BIT DEPTH"
          value={String(bits)}
          onPrev={() => setParam("bitDepth", Math.max(1, bits - 1))}
          onNext={() => setParam("bitDepth", Math.min(16, bits + 1))}
          editable={{ numericValue: bits, min: 1, max: 16, onCommit: (v) => setParam("bitDepth", Math.round(v)) }}
        />
        <ArrowRow
          label="SAMPLE RATE"
          value={`${rate} Hz`}
          onPrev={() => setParam("reducedSampleRate", Math.max(1000, rate - 250))}
          onNext={() => setParam("reducedSampleRate", Math.min(48000, rate + 250))}
          editable={{ numericValue: rate, format: (n) => `${n} Hz`, min: 1000, max: 48000, onCommit: (v) => setParam("reducedSampleRate", Math.round(v)) }}
        />
      </>
    );
  }
  if (op === "FADE_IN" || op === "FADE_OUT") {
    const curve = params.fadeCurve ?? "LINEAR";
    return (
      <>
        <ArrowRow
          label="LENGTH"
          value={`${params.fadeMs ?? 50} ms`}
          onPrev={() => setParam("fadeMs", Math.max(1, (params.fadeMs ?? 50) - 5))}
          onNext={() => setParam("fadeMs", Math.min(10000, (params.fadeMs ?? 50) + 5))}
          editable={{ numericValue: params.fadeMs ?? 50, format: (n) => `${n} ms`, min: 1, max: 10000, onCommit: (v) => setParam("fadeMs", Math.round(v)) }}
        />
        <ArrowRow
          label="CURVE"
          value={curve}
          onPrev={() => {
            const i = FADE_CURVE_CYCLE.indexOf(curve);
            const next = FADE_CURVE_CYCLE[(i - 1 + FADE_CURVE_CYCLE.length) % FADE_CURVE_CYCLE.length];
            setParam("fadeCurve", next);
          }}
          onNext={() => {
            const i = FADE_CURVE_CYCLE.indexOf(curve);
            const next = FADE_CURVE_CYCLE[(i + 1) % FADE_CURVE_CYCLE.length];
            setParam("fadeCurve", next);
          }}
        />
      </>
    );
  }
  return null;
}

function cyclePreset(currentLabel: string, dir: 1 | -1, setParam: SetParamFn) {
  const i = BIT_REDUCE_PRESET_CYCLE.indexOf(currentLabel as typeof BIT_REDUCE_PRESET_CYCLE[number]);
  const startIndex = i >= 0 ? i : 0;
  const next = BIT_REDUCE_PRESET_CYCLE[(startIndex + dir + BIT_REDUCE_PRESET_CYCLE.length) % BIT_REDUCE_PRESET_CYCLE.length];
  if (next === "CUSTOM") return; // Keep user's manual values when cycling to CUSTOM.
  const preset = BIT_REDUCE_PRESET_VALUES[next];
  setParam("bitDepth", preset.bitDepth);
  setParam("reducedSampleRate", preset.reducedSampleRate);
}

// ============================================================================
// SAMPLE KEEP / RETRY — confirm dialog after Sample Edit operation.
// ============================================================================

export function SampleKeepRetryScreen() {
  const pending = useAppStore((s) => s.pendingSampleEdit);
  const keepEditedSample = useAppStore((s) => s.keepEditedSample);
  const overwriteEditedSample = useAppStore((s) => s.overwriteEditedSample);
  const retryEditedSample = useAppStore((s) => s.retryEditedSample);
  const previewEditedSample = useAppStore((s) => s.previewEditedSample);

  const [editingName, setEditingName] = useState(pending?.proposedName ?? "");
  // Keep local name in sync if pending changes (Retry → new op → new pending).
  useEffect(() => {
    if (pending?.proposedName) setEditingName(pending.proposedName);
  }, [pending?.proposedName]);

  if (!pending) {
    return (
      <ScreenFrame title="SAMPLE KEEP / RETRY" subtitle="">
        {shell(
          <div className="grid h-full content-center justify-center text-[#91a477]">
            <p>No pending sample edit.</p>
          </div>,
          ["F1 —", "F2 —", "F3 —", "F4 —", "F5 —", { label: "F6 EXIT", onClick: retryEditedSample }],
          retryEditedSample,
        )}
      </ScreenFrame>
    );
  }

  const onKeep = () => keepEditedSample(editingName);

  return (
    <ScreenFrame title="NEW SAMPLE" subtitle={`${pending.opLabel} applied to ${pending.sourceSampleName}`}>
      {shell(
        <div className="grid h-full grid-rows-[auto_1fr] gap-[12px]">
          <section className="grid grid-cols-[1fr_1fr] gap-[2.3%] border border-[#46533b] bg-black/20 p-[3%] text-[clamp(10px,0.84vw,13px)] tracking-[0.14em]">
            <div className="grid content-start gap-[6px]">
              <p className="text-[#91a477]">NEW SAMPLE NAME</p>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                maxLength={24}
                className="border border-[#46533b] bg-black/30 px-[8px] py-[4px] text-[#eef6d8] tracking-[0.14em] outline-none focus:border-amber-100"
              />
              <p className="text-[#91a477] text-[clamp(9px,0.72vw,11px)]">Max 24 chars. Collisions auto-resolved with _N suffix.</p>
            </div>
            <div className="grid content-start gap-[4px] text-[clamp(10px,0.78vw,12px)]">
              <p className="text-[#91a477]">RESULT</p>
              <div className="grid grid-cols-[1fr_auto]"><span>OP</span><span className="text-[#eef6d8]">{pending.opLabel}</span></div>
              <div className="grid grid-cols-[1fr_auto]"><span>LENGTH</span><span className="text-[#eef6d8]">{pending.newDurationMs} ms</span></div>
              <div className="grid grid-cols-[1fr_auto]"><span>RATE</span><span className="text-[#eef6d8]">{pending.newSampleRate} Hz</span></div>
              <div className="grid grid-cols-[1fr_auto]"><span>CHANNELS</span><span className="text-[#eef6d8]">{pending.newChannelCount}</span></div>
            </div>
          </section>
          <section className="grid min-h-0 content-center gap-[10px] border border-[#46533b] bg-black/20 p-[3%] text-[clamp(10px,0.8vw,13px)] tracking-[0.14em]">
            <p className="text-[#91a477] text-center">F2 PLAY · F3 OVERWRITE · F4 RETRY · F5 KEEP</p>
            <p className="text-center text-[#d8e3b7]">
              KEEP saves as new sample. OVERWRITE replaces the original (all pads using it play the new audio).
              RETRY discards the edit and returns to the Sample Edit window.
            </p>
          </section>
        </div>,
        [
          "F1 —",
          { label: "F2 PLAY", onClick: previewEditedSample },
          { label: "F3 OVERWRITE", onClick: overwriteEditedSample },
          { label: "F4 RETRY", onClick: retryEditedSample },
          { label: "F5 KEEP", onClick: onKeep },
          "F6 —",
        ],
        retryEditedSample,
      )}
    </ScreenFrame>
  );
}
