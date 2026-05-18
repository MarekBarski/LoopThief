import type { ComponentType } from "react";
import type { ScreenId } from "../types/navigation";
import { ChopScreen } from "./ChopScreen";
import { DiskScreen } from "./DiskScreen";
import { MainScreen } from "./MainScreen";
import { MixScreen } from "./MixScreen";
import { PerformanceScreen } from "./PerformanceScreen";
import { ProgramScreen } from "./ProgramScreen";
import { RecordScreen } from "./RecordScreen";
import { SettingsScreen } from "./SettingsScreen";
import { SongScreen } from "./SongScreen";
import { StepScreen } from "./StepScreen";
import { PadPlayScreen } from "./PadPlayScreen";
import {
  CountInUtilityScreen,
  EraseUtilityScreen,
  GoToUtilityScreen,
  NextSeqUtilityScreen,
  NoteRepeatUtilityScreen,
  PadMuteUtilityScreen,
  SixteenLevelsScreen,
  SequenceEditUtilityScreen,
  TrackMuteUtilityScreen,
  UndoUtilityScreen,
} from "./UtilityScreens";

export const screensById: Record<ScreenId, ComponentType> = {
  MAIN: MainScreen,
  RECORD: RecordScreen,
  CHOP: ChopScreen,
  PROGRAM: ProgramScreen,
  STEP: StepScreen,
  PERFORMANCE: PerformanceScreen,
  MIX: MixScreen,
  DISK: DiskScreen,
  SETTINGS: SettingsScreen,
  SONG: SongScreen,
  PAD_PLAY: PadPlayScreen,
  UTILITY_16_LEVELS: SixteenLevelsScreen,
  UTILITY_TRACK_MUTE: TrackMuteUtilityScreen,
  UTILITY_PAD_MUTE: PadMuteUtilityScreen,
  UTILITY_NEXT_SEQ: NextSeqUtilityScreen,
  UTILITY_NOTE_REPEAT: NoteRepeatUtilityScreen,
  COUNT_IN: CountInUtilityScreen,
  GO_TO: GoToUtilityScreen,
  ERASE: EraseUtilityScreen,
  UNDO: UndoUtilityScreen,
  SEQUENCE_EDIT: SequenceEditUtilityScreen,
};
