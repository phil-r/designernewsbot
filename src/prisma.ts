import { Prisma, PrismaClient } from '@prisma/client';

const prismaOptions: Prisma.PrismaClientOptions = {};

const prisma: PrismaClient<Prisma.PrismaClientOptions, 'query'> =
  new PrismaClient(prismaOptions);

export default prisma;
