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
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL || "gpt-5";

  // Uses the OpenAI Responses API (recommended). If you prefer Chat Completions,
  // swap the endpoint and payload shape.
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "text", text: parsed.data.system }] },
        ...parsed.data.messages.map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })),
      ],
      // Keep it deterministic-ish for config generation
      temperature: 0.2,
      max_output_tokens: 1200,
    }),
  });

  const data = await res.json();
  // Normalize to the UI format you were using: { text }
  const text =
    (data.output_text as string) ||
    data.output?.flatMap((o: any) => o.content || []).find((c: any) => c.type === "output_text")?.text ||
    "";

  return Response.json({ ok: res.ok, text, raw: data }, { status: res.status });
}
