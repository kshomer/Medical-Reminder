import { Context, Scenes } from 'telegraf';

export interface ScheduleData {
  time: string;
  dosage: string;
  notes?: string;
}

export interface MedicationData {
  name?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date | null;
  frequency?: string;
  weekDays?: string[]; // Массив дней недели
  intervalDays?: number;
  timesPerDay?: number;
  schedules?: ScheduleData[]; // Массив расписаний
  currentScheduleIndex?: number; // Индекс текущего редактируемого расписания
  tempDate?: Date; // Временная дата для календаря
}

export interface SessionData extends Scenes.WizardSessionData {
  medication?: MedicationData;
}

export interface BotContext extends Context {
  scene: Scenes.SceneContextScene<BotContext, SessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}
