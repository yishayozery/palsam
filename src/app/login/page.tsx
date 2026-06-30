import { prisma } from "@/lib/prisma";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string }>;
}) {
  const { b } = await searchParams;
  let battalion: { name: string; code: string; motto: string | null; logoData: string | null } | null = null;

  if (b) {
    const found = await prisma.battalion.findUnique({
      where: { code: b },
      select: { name: true, code: true, motto: true, logoData: true },
    });
    if (found) battalion = found;
  }

  return <LoginForm battalion={battalion} />;
}
