import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  payloadXml: z.string().optional(),
  response: z.string().optional(),
  ok: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const change = await prisma.change.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        userId: "system", // for now; real user linkage can be added later
        title: parsed.data.title,
        planJson: undefined,
        payloadXml: parsed.data.payloadXml,
        response: parsed.data.response,
        ok: parsed.data.ok ?? false,
      },
    });

    return Response.json({ ok: true, change }, { status: 200 });
  } catch (err) {
    console.error("Failed to create Change", err);
    return Response.json({ error: "Failed to log change" }, { status: 500 });
  }
}

