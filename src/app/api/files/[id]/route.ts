import { connection, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { inlineDisposition } from "@/lib/storage";

/**
 * Serves an uploaded file. Profile photos are public. Anything else (verification
 * documents) is only served to the trainer it belongs to and to admins; everyone
 * else gets a 404 so private ids can't be probed.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  // Always answer at request time: access depends on who is asking.
  await connection();
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/i.test(id)) return notFound();

  const file = await db.storedFile.findUnique({
    where: { id },
    select: {
      ownerId: true,
      filename: true,
      contentType: true,
      avatarOf: { select: { id: true } },
      document: { select: { trainer: { select: { userId: true } } } },
    },
  });
  if (!file) return notFound();

  const isPublic = file.avatarOf !== null;
  if (!isPublic) {
    const viewer = await getCurrentUser();
    const ownerUserId = file.document ? file.document.trainer.userId : file.ownerId;
    if (!viewer || (viewer.role !== "ADMIN" && viewer.id !== ownerUserId)) return notFound();
  }

  const headers = new Headers({
    "Content-Type": file.contentType,
    "Content-Disposition": inlineDisposition(file.filename),
    "X-Content-Type-Options": "nosniff",
    // Files never change: a new upload gets a new id. Photos are cached for an hour only, so
    // one that was removed (by its owner or an admin) stops showing soon. Private documents
    // are never stored by caches.
    "Cache-Control": isPublic ? "public, max-age=3600" : "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
  });

  const etag = `"${id}"`;
  if (isPublic) {
    headers.set("ETag", etag);
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
  }

  const content = await db.storedFile.findUnique({ where: { id }, select: { data: true } });
  if (!content) return notFound();
  headers.set("Content-Length", String(content.data.length));
  return new Response(content.data, { status: 200, headers });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
