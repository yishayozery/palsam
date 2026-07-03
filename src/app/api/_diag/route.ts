export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const argon2 = (await import("argon2")).default;
    const h = await argon2.hash("diagtest123");
    out.argon2 = { ok: true, prefix: h.slice(0, 12) };
  } catch (e) {
    out.argon2 = { ok: false, error: String(e), code: (e as { code?: string })?.code };
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    const n = await prisma.battalion.count();
    out.prisma = { ok: true, battalions: n };
  } catch (e) {
    out.prisma = { ok: false, error: String(e), code: (e as { code?: string })?.code };
  }
  return Response.json(out);
}
