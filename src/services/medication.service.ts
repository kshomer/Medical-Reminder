import { prisma } from '../utils/prisma';
import { UserService } from './user.service';

interface CreateMedicationDto {
  telegramId: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate?: Date | null;
  frequency: string;
  weekDays?: string[]; // Для WEEKLY частоты
  intervalDays?: number; // Для INTERVAL частоты
  timesPerDay: number; // Количество раз в день
  schedules: { time: string; dosage: string; notes?: string }[];
}

export class MedicationService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async createMedication(data: CreateMedicationDto) {
    try {
      const user = await this.userService.getUserByTelegramId(data.telegramId);
      if (!user) {
        throw new Error('User not found');
      }

      return await prisma.medication.create({
        data: {
          userId: user.id,
          name: data.name,
          description: data.description,
          startDate: data.startDate,
          endDate: data.endDate,
          frequency: data.frequency,
          weekDays: data.weekDays ? JSON.stringify(data.weekDays) : null,
          intervalDays: data.intervalDays,
          timesPerDay: data.timesPerDay,
          schedules: {
            create: data.schedules,
          },
        },
        include: { schedules: true },
      });
    } catch (error) {
      throw new Error(`Failed to create medication: ${error}`);
    }
  }
}