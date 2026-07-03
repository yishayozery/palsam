export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const steps: string[] = [];
  try {
    steps.push("start");
    const mod = await import("argon2");
    steps.push("argon2-imported");
    const h = await mod.default.hash("x");
    steps.push("argon2-hashed:" + h.slice(0, 8));
  } catch (e) {
    return new Response("ARGON2_FAIL @ " + steps.join(">") + " :: " + String(e), { status: 200 });
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    steps.push("prisma-imported");
    const n = await prisma.battalion.count();
    steps.push("prisma-count:" + n);
  } catch (e) {
    return new Response("PRISMA_FAIL @ " + steps.join(">") + " :: " + String(e), { status: 200 });
  }
  return new Response("ALL_OK :: " + steps.join(">"), { status: 200 });
}
