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
import { StepScreen } from "./StepScreen";

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
};
