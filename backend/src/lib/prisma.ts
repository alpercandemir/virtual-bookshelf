import { PrismaClient } from '@prisma/client';

let sharedPrisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!sharedPrisma) {
    sharedPrisma = new PrismaClient();
  }
  return sharedPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (sharedPrisma) {
    await sharedPrisma.$disconnect();
    sharedPrisma = null;
  }
}
