import { notFound } from 'next/navigation';
import FlowClient from '@/components/flow/FlowClient';

// The seeded entry points the canvas boards provided (Create.dc.html, Respond.dc.html, …), with their titles.
const STARTS: Record<string, string> = {
  create: 'Create — showup.',
  respond: 'Respond — showup.',
  fresh: 'Your event — showup.',
  join: 'Join — showup.',
  guest: 'Event, guest view — showup.',
  participant: 'Respond, participant — showup.',
};

export const dynamicParams = false; // unknown values → 404

export function generateStaticParams() {
  return Object.keys(STARTS).map((startAt) => ({ startAt }));
}

type PreviewProps = { params: Promise<{ startAt: string }> };

export async function generateMetadata({ params }: PreviewProps) {
  const { startAt } = await params;
  return { title: STARTS[startAt] };
}

export default async function Preview({ params }: PreviewProps) {
  const { startAt } = await params;
  if (!STARTS[startAt]) notFound();
  return <FlowClient startAt={startAt} />;
}
