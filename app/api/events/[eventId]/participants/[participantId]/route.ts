import { getDb } from '@/lib/server/db';
import { handleRemoveParticipant } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ eventId: string; participantId: string }> };

export async function DELETE(req: Request, ctx: Props) {
  const { eventId, participantId } = await ctx.params;
  return handleRemoveParticipant(eventId, participantId, req, getDb);
}
