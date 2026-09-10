import { StorageAdapter } from "grammy";
import { prisma } from "./client";

export class PrismaSessionAdapter implements StorageAdapter<any> {
  async read(key: string): Promise<any | undefined> {
    const session = await prisma.session.findUnique({
      where: { id: key },
    });
    return session ? JSON.parse(session.value) : undefined;
  }

  async write(key: string, value: any): Promise<void> {
    const strValue = JSON.stringify(value);
    await prisma.session.upsert({
      where: { id: key },
      update: { value: strValue },
      create: { id: key, value: strValue },
    });
  }

  async delete(key: string): Promise<void> {
    await prisma.session.delete({
      where: { id: key },
    }).catch(() => {
      // Ignore error if it doesn't exist
    });
  }
}
