import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinMixin } from './join';

function flow(state: Record<string, unknown>) {
  const f: any = Object.create(JoinMixin.prototype);
  f.state = state;
  f.setState = (p: Record<string, unknown>) => {
    f.state = { ...f.state, ...p };
  };
  f.go = vi.fn((p: Record<string, unknown>) => f.setState(p));
  return f;
}
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('joining a stored event', () => {
  it('shows the taken-name error on 409, keeps the typed name and stays on Join', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'name_taken', message: "That name's taken. Try adding an initial." } }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const f = flow({
      screen: 'join',
      joinName: 'Sam ',
      event: { id: 'EVT1', persisted: true, responses: [], slots: [], win: { s: 1080, e: 1380 } },
    });
    f.joinContinue();
    await settle();
    expect(fetch).toHaveBeenCalledWith(
      '/api/events/EVT1/join',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Sam' }) }),
    );
    expect(f.state.joinError).toBe("That name's already taken.");
    expect(f.joinVals(f.state)).toMatchObject({
      hasJoinError: true,
      joinError: "That name's already taken.",
      joinName: 'Sam ',
      joinDisabled: false,
    });
    expect(f.state.screen).toBe('join');
    expect(f.go).not.toHaveBeenCalled();
  });
});
