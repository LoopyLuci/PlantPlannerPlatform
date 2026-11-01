import { describe, expect, it } from 'vitest';
import type { DesignView } from '../src/api';
import { applyAll, applyEntry, drainOutbox, newPlacementId, type OutboxEntry, type SendResult } from '../src/outbox/logic';

const design: DesignView = {
  designId: 'd_test',
  name: 'Test',
  archived: false,
  seq: 5,
  site: { name: 'Plot', widthM: 6, depthM: 4 } as DesignView['site'],
  placements: [{ id: 'p_existing', speciesUrn: 'urn:ppp:species:sage', x: 1, y: 1, footprintM: 0.5, pinned: false }],
};

const footprintOf = () => 0.6;

function entry(partial: Partial<OutboxEntry> & Pick<OutboxEntry, 'capability' | 'input' | 'baseSeq'>): OutboxEntry {
  return {
    designId: 'd_test',
    idempotencyKey: `key-${Math.random()}`,
    createdAt: '2026-11-01T00:00:00.000Z',
    state: 'pending',
    ...partial,
  };
}

describe('applying queued changes to a copy of the design', () => {
  it('adds a placement with the id the client chose and the default footprint', () => {
    const next = applyEntry(
      design,
      entry({ capability: 'design.add_placement', baseSeq: 5, input: { placement_id: 'p_new', species_urn: 'urn:ppp:species:mint', x: 2, y: 3 } }),
      footprintOf,
    );
    expect(next.placements.map((p) => p.id)).toEqual(['p_existing', 'p_new']);
    expect(next.placements[1]).toMatchObject({ x: 2, y: 3, footprintM: 0.6, pinned: false });
    expect(next.seq).toBe(6);
  });

  it('moves a placement and leaves the other fields as they were', () => {
    const next = applyEntry(
      design,
      entry({ capability: 'design.update_placement', baseSeq: 5, input: { placement_id: 'p_existing', x: 3 } }),
      footprintOf,
    );
    expect(next.placements[0]).toMatchObject({ x: 3, y: 1, speciesUrn: 'urn:ppp:species:sage' });
  });

  it('removes a placement', () => {
    const next = applyEntry(design, entry({ capability: 'design.remove_placement', baseSeq: 5, input: { placement_id: 'p_existing' } }), footprintOf);
    expect(next.placements).toEqual([]);
  });

  it('applies changes in order and ignores changes for other designs', () => {
    const queue = [
      entry({ capability: 'design.add_placement', baseSeq: 5, input: { placement_id: 'p_a', species_urn: 'urn:ppp:species:mint', x: 2, y: 2 } }),
      entry({ capability: 'design.update_placement', baseSeq: 6, input: { placement_id: 'p_a', y: 3 } }),
      entry({ designId: 'other', capability: 'design.remove_placement', baseSeq: 5, input: { placement_id: 'p_existing' } }),
    ];
    const next = applyAll(design, queue, footprintOf);
    expect(next.placements.map((p) => [p.id, p.x, p.y])).toEqual([
      ['p_existing', 1, 1],
      ['p_a', 2, 3],
    ]);
    expect(next.seq).toBe(7);
  });
});

describe('the client-chosen placement id', () => {
  it('has the shape the server accepts', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(newPlacementId()).toMatch(/^p_[0-9a-f]{12}$/);
    }
  });
});

describe('draining the outbox', () => {
  const queue = [
    { ...entry({ capability: 'design.add_placement', baseSeq: 5, input: {} }), id: 1 },
    { ...entry({ capability: 'design.update_placement', baseSeq: 6, input: {} }), id: 2 },
    { ...entry({ capability: 'design.remove_placement', baseSeq: 7, input: {} }), id: 3 },
  ];

  function recorder(results: SendResult[]) {
    const sent: number[] = [];
    const accepted: number[] = [];
    const refused: { id: number; message: string }[] = [];
    let call = 0;
    return {
      sent,
      accepted,
      refused,
      send: async (e: OutboxEntry) => {
        sent.push(e.id ?? -1);
        return results[call++] ?? { kind: 'ok' };
      },
      handlers: {
        accepted: async (e: OutboxEntry) => void accepted.push(e.id ?? -1),
        refused: async (e: OutboxEntry, message: string) => void refused.push({ id: e.id ?? -1, message }),
      },
    };
  }

  it('reports empty when there is nothing to send', async () => {
    const r = recorder([]);
    expect(await drainOutbox([], r.send, r.handlers)).toBe('empty');
    expect(r.sent).toEqual([]);
  });

  it('sends every change in order when the server accepts them', async () => {
    const r = recorder([{ kind: 'ok' }, { kind: 'ok' }, { kind: 'ok' }]);
    expect(await drainOutbox(queue, r.send, r.handlers)).toBe('drained');
    expect(r.sent).toEqual([1, 2, 3]);
    expect(r.accepted).toEqual([1, 2, 3]);
  });

  it('stops when the server becomes unreachable and keeps the rest for later', async () => {
    const r = recorder([{ kind: 'ok' }, { kind: 'unreachable' }]);
    expect(await drainOutbox(queue, r.send, r.handlers)).toBe('unreachable');
    expect(r.sent).toEqual([1, 2]);
    expect(r.accepted).toEqual([1]);
  });

  it('marks a refused change as a conflict and sends nothing after it', async () => {
    const r = recorder([{ kind: 'ok' }, { kind: 'conflict', message: 'The design changed.' }]);
    expect(await drainOutbox(queue, r.send, r.handlers)).toBe('blocked');
    expect(r.sent).toEqual([1, 2]);
    expect(r.refused).toEqual([{ id: 2, message: 'The design changed.' }]);
  });

  it('does not send anything while an earlier change is waiting for a person', async () => {
    const r = recorder([]);
    const blocked = [{ ...queue[0], state: 'conflict' as const }, ...queue.slice(1)];
    expect(await drainOutbox(blocked, r.send, r.handlers)).toBe('blocked');
    expect(r.sent).toEqual([]);
  });
});
