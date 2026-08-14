import type { Ctx } from "@/app/api/v1/[...path]/route";

export type Handler = (ctx: Ctx) => Promise<unknown>;

export interface Module {
  list?: Handler;
  get?: Handler;
  create?: Handler;
  update?: Handler;
  remove?: Handler;
  actions?: Record<string, Handler>;
}

import { dashboardModule } from "./dashboard";
import { studentsModule } from "./students";
import { staffModule } from "./staff";
import { classesModule } from "./classes";
import { learningModule } from "./learning";
import { attendanceModule } from "./attendance";
import { resultsModule } from "./results";
import { messagingModule } from "./messaging";
import { feesModule } from "./fees";
import { hostelModule } from "./hostel";
import { timetableModule } from "./timetable";
import { transportModule } from "./transport";
import { applicationsModule } from "./applications";
import { reportsModule } from "./reports";
import { settingsModule } from "./settings";
import { auditModule } from "./audit";
import { profileModule } from "./profile";
import { galleryModule } from "./gallery";
import { newsModule } from "./news";
import { contentModule } from "./content";
import { teacherModule } from "./teacher";
import { elearnModule } from "./elearn";
import { gamesModule } from "./games";
import { featuresModule } from "./features";
import { progressModule } from "./progress";
import { ptaModule } from "./pta";
import { libraryModule } from "./library";
import { payrollModule } from "./payroll";
import { aiModule } from "./ai";

export const modules: Record<string, Module> = {
  dashboard: dashboardModule,
  students: studentsModule,
  staff: staffModule,
  classes: classesModule,
  learning: learningModule,
  attendance: attendanceModule,
  results: resultsModule,
  messages: messagingModule,
  fees: feesModule,
  hostel: hostelModule,
  timetable: timetableModule,
  transport: transportModule,
  applications: applicationsModule,
  reports: reportsModule,
  settings: settingsModule,
  audit: auditModule,
  profile: profileModule,
  gallery: galleryModule,
  news: newsModule,
  content: contentModule,
  teacher: teacherModule,
  elearn: elearnModule,
  games: gamesModule,
  features: featuresModule,
  progress: progressModule,
  pta: ptaModule,
  library: libraryModule,
  payroll: payrollModule,
  ai: aiModule,
};

export type { Ctx };
