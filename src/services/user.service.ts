import { User } from '@prisma/client';
import { prisma } from '../utils/prisma';

interface CreateUserDto {
  telegramId: string;
  firstName?: string;
  timezone: string;
}

export class UserService {
  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
      return await prisma.user.findUnique({
        where: { telegramId }
      });
    } catch (error) {
      throw new Error(`Failed to get user: ${error}`);
    }
  }

  async createUser(data: CreateUserDto): Promise<User> {
    try {
      return await prisma.user.create({
        data
      });
    } catch (error) {
      throw new Error(`Failed to create user: ${error}`);
    }
  }
}