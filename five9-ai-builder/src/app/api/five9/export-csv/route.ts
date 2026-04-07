import { z } from "zod";

const Schema = z.object({
  rows: z.array(z.record(z.string())),
  filename: z.string().min(1).default("dispositions.csv"),
});

/** Escape a CSV field (quote if contains comma, newline, or quote). */
function escapeCsvField(val: string): string {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { rows, filename } = parsed.data;
  if (rows.length === 0) {
    return Response.json({ error: "No rows to export" }, { status: 400 });
  }

  const headers = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r)))
  ).sort();
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((r) => headers.map((h) => escapeCsvField(r[h] ?? "")).join(","));
  const csv = [headerLine, ...dataLines].join("\r\n");

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeName}"`,
    },
  });
}
