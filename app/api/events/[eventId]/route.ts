import { getDb } from '@/lib/server/db';
import { handleDeleteEvent, handleGetEvent, handleUpdateEvent } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  return handleGetEvent(eventId, getDb);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  return handleUpdateEvent(eventId, req, getDb);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  return handleDeleteEvent(eventId, req, getDb);
}
