import { z } from "zod";

const Schema = z.object({
  system: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.2,
      system: parsed.data.system,
      messages: parsed.data.messages.map((m) => ({
        role: m.role,
        content: [{ type: "text", text: m.content }],
      })),
    }),
  });

  const data = await res.json().catch(() => null);

  const text =
    data?.content?.find((c: any) => c.type === "text")?.text ??
    data?.content?.[0]?.text ??
    "";

  return Response.json({ ok: res.ok, text, raw: data }, { status: res.status });
}
