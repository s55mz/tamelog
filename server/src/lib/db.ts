import { prisma } from "./prisma";

export async function checkDbReady() {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}
