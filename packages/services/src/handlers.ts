import {
  type DesignState,
  type FeedbackReasonTag,
  type KnowledgeGraph,
  MODEL_VERSION,
  NUMERIC_TRAITS,
  type PlacementState,
  type SiteState,
  type SpeciesRecord,
  type TraitName,
  checkCandidate,
  defaultFootprint,
  evaluateDesign,
  routeFeedback,
  suggestCandidates,
  traitValue,
} from '@ppp/core';
import {
  type DesignIntegrity,
  type FeedbackEntry,
  exportPlainArchive,
  sha256Hex,
  type StoredEvent,
} from '@ppp/store';
import type { ServiceContext } from './context';
import { CapabilityError } from './errors';
import { STARTER_GARDEN } from './templates';

/**
 * One handler per capability id. The registry defines the contract; these
 * functions implement it. A test asserts that the two maps have identical keys.
 */

export interface CallMeta {
  interface: string;
  actorId: string;
  idempotencyKey: string | null;
}

export type Handler = (ctx: ServiceContext, input: Record<string, unknown>, meta: CallMeta) => Promise<Record<string, unknown>>;

const DESIGN_ID_PATTERN = /^d_[0-9a-f]{16}$/;
const PLACEMENT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Design ids become file names, so only the derived form is accepted (no path traversal). */
function assertDesignId(value: unknown): string {
  if (typeof value !== 'string' || !DESIGN_ID_PATTERN.test(value)) {
    throw new CapabilityError('validation_error', 'design_id must look like d_0123456789abcdef', { field: 'design_id' });
  }
  return value;
}

/** Placement ids are object keys. Names inherited from Object.prototype are refused. */
function assertPlacementId(value: string): string {
  if (!PLACEMENT_ID_PATTERN.test(value) || value in Object.prototype) {
    throw new CapabilityError('validation_error', `placement_id "${value}" is not allowed`, { field: 'placement_id' });
  }
  return value;
}

function actorOf(meta: CallMeta): { id: string; interface: string } {
  return { id: meta.actorId, interface: meta.interface };
}

function speciesOf(kg: KnowledgeGraph, urn: string): SpeciesRecord {
  const species = kg.species.get(urn);
  if (!species) {
    throw new CapabilityError('not_found', `Species ${urn} is not in knowledge graph ${kg.graphVersion}`, { urn });
  }
  return species;
}

async function loadDesign(ctx: ServiceContext, designId: string): Promise<DesignState> {
  const state = await ctx.store.loadState(designId);
  if (!state) throw new CapabilityError('not_found', `Design ${designId} does not exist`, { designId });
  return state;
}

/** The event that already used this idempotency key, if any. Replays return it without writing. */
async function priorEvent(ctx: ServiceContext, designId: string, key: string | null): Promise<StoredEvent | undefined> {
  if (key === null) return undefined;
  const log = await ctx.store.readLog(designId);
  if (!log.chain.ok) {
    throw new CapabilityError('integrity_error', `design ${designId} failed its integrity check: ${log.chain.problem}`, {
      designId,
    });
  }
  return log.events.find((event) => event.idempotency_key === key);
}

function requireInside(site: SiteState, x: number, y: number): void {
  const finite = Number.isFinite(x) && Number.isFinite(y);
  if (!finite || x < 0 || y < 0 || x > site.widthM || y > site.depthM) {
    throw new CapabilityError(
      'validation_error',
      `Position (${x}, ${y}) m is outside the ${site.widthM} x ${site.depthM} m site`,
      { x, y, widthM: site.widthM, depthM: site.depthM },
    );
  }
}

function publicDesign(state: DesignState) {
  return {
    designId: state.designId,
    name: state.name,
    archived: state.archived,
    seq: state.seq,
    site: state.site,
    placements: Object.values(state.placements).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function speciesSummary(kg: KnowledgeGraph, species: SpeciesRecord): Record<string, unknown> {
  const t = (name: TraitName) => traitValue(kg, species.urn, name) ?? null;
  return {
    urn: species.urn,
    scientificName: species.scientificName,
    commonName: species.commonName,
    family: species.family,
    growthForm: species.growthForm,
    guildLayer: species.guildLayer,
    traits: {
      matureHeightM: t('mature_height_m'),
      matureSpreadM: t('mature_spread_m'),
      plantingSpacingM: t('planting_spacing_m'),
      sunHoursMin: t('sun_hours_min'),
      phMin: t('ph_min'),
      phMax: t('ph_max'),
      hardinessMin: t('hardiness_min'),
      hardinessMax: t('hardiness_max'),
    },
  };
}

const SITE_FIELDS = {
  hardiness_zone: 'hardinessZone',
  sun_hours: 'sunHours',
  soil_ph: 'soilPh',
  width_m: 'widthM',
  depth_m: 'depthM',
} as const;

/** One feedback entry as the API returns it, with the route it was sent to (computed now, from the stored reason). */
function feedbackItem(entry: FeedbackEntry): Record<string, unknown> {
  const { payload } = entry;
  return {
    id: payload.id,
    seq: entry.seq,
    recordedAt: entry.ts,
    actor: entry.actor,
    designId: payload.designId,
    placementId: payload.placementId,
    rule: payload.rule,
    reasonTag: payload.reasonTag,
    note: payload.note,
    ...routeFeedback(payload.reasonTag as FeedbackReasonTag),
    graphVersion: payload.graphVersion,
    ruleConfigVersion: payload.ruleConfigVersion,
    modelVersion: payload.modelVersion,
  };
}

function statusOf(integrity: DesignIntegrity): 'healthy' | 'degraded' | 'corrupt' {
  if (!integrity.chainOk) return 'corrupt';
  if (integrity.tornTail || integrity.snapshot.status === 'mismatch') return 'degraded';
  return 'healthy';
}

export const HANDLERS: Record<string, Handler> = {
  'platform.get_health': async (ctx) => {
    const report = await ctx.store.health();
    return {
      status: report.status,
      checkedDesigns: report.checkedDesigns,
      designs: report.designs,
      knowledge: {
        graphVersion: ctx.kg.graphVersion,
        graphStatus: ctx.kg.graphStatus,
        species: ctx.kg.species.size,
        edges: ctx.kg.edges.length,
      },
    };
  },

  'plants.search': async (ctx, input) => {
    const query = String(input.query ?? '').trim().toLowerCase();
    const family = input.family ? String(input.family).toLowerCase() : null;
    const layer = input.guild_layer ? String(input.guild_layer) : null;
    const limit = Number(input.limit ?? 25);
    const matches = [...ctx.kg.species.values()]
      .filter((sp) => {
        if (family && sp.family.toLowerCase() !== family) return false;
        if (layer && sp.guildLayer !== layer) return false;
        if (!query) return true;
        return [sp.scientificName, sp.commonName, sp.family].some((text) => text.toLowerCase().includes(query));
      })
      .sort((a, b) => a.commonName.localeCompare(b.commonName));
    return {
      count: matches.length,
      items: matches.slice(0, limit).map((sp) => speciesSummary(ctx.kg, sp)),
    };
  },

  'plants.get_profile': async (ctx, input) => {
    const urn = String(input.urn);
    const species = speciesOf(ctx.kg, urn);
    const traitEntries = Object.entries(ctx.kg.traits.get(urn) ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const traits = traitEntries.map(([name, value]) => ({
      name,
      value: value?.value,
      sourceId: value?.sourceId,
      grade: value?.grade,
    }));
    const known = new Set(traitEntries.map(([name]) => name));
    const companions = ctx.kg.edges
      .filter((e) => e.a === urn || e.b === urn)
      .map((e) => {
        const partner = e.a === urn ? e.b : e.a;
        return {
          partnerUrn: partner,
          partnerName: ctx.kg.species.get(partner)?.commonName ?? partner,
          mechanism: e.mechanism,
          direction: e.direction,
          sourceId: e.sourceId,
          grade: e.grade,
          note: e.note,
        };
      });
    const sourceIds = [...new Set([...traits.map((t) => t.sourceId), ...companions.map((c) => c.sourceId)])].sort();
    const sources = sourceIds.map((id) => ctx.kg.sources.get(id ?? '')).filter((s) => s !== undefined);
    return {
      species: speciesSummary(ctx.kg, species),
      traits,
      unknownTraits: NUMERIC_TRAITS.filter((name) => !known.has(name)),
      companions,
      sources,
      graphStatus: ctx.kg.graphStatus,
    };
  },

  'design.list': async (ctx, input) => {
    const includeArchived = input.include_archived === true;
    const designs = [];
    for (const designId of await ctx.store.listDesignIds()) {
      const state = await ctx.store.loadState(designId);
      if (!state) continue;
      if (state.archived && !includeArchived) continue;
      designs.push({
        designId,
        name: state.name,
        archived: state.archived,
        seq: state.seq,
        placementCount: Object.keys(state.placements).length,
      });
    }
    designs.sort((a, b) => a.name.localeCompare(b.name) || a.designId.localeCompare(b.designId));
    return { designs };
  },

  'design.get': async (ctx, input) => {
    const state = await loadDesign(ctx, assertDesignId(input.design_id));
    return { ...publicDesign(state) };
  },

  'design.history': async (ctx, input) => {
    const designId = assertDesignId(input.design_id);
    const log = await ctx.store.readLog(designId);
    if (!log.chain.ok) throw new CapabilityError('integrity_error', `design ${designId}: ${log.chain.problem}`, { designId });
    if (log.events.length === 0) throw new CapabilityError('not_found', `Design ${designId} does not exist`, { designId });
    return {
      designId,
      headSeq: log.events.length,
      events: log.events.slice(-Number(input.limit ?? 100)),
    };
  },

  'design.evaluate': async (ctx, input) => {
    const state = await loadDesign(ctx, assertDesignId(input.design_id));
    return { ...evaluateDesign(state, ctx.kg, ctx.rules) };
  },

  'design.verify': async (ctx, input) => {
    if (input.design_id === undefined) {
      const report = await ctx.store.health();
      return { status: report.status, checkedDesigns: report.checkedDesigns, designs: report.designs };
    }
    const designId = assertDesignId(input.design_id);
    if (!(await ctx.store.hasDesign(designId))) {
      throw new CapabilityError('not_found', `Design ${designId} does not exist`, { designId });
    }
    const integrity = await ctx.store.verify(designId);
    return { status: statusOf(integrity), checkedDesigns: 1, designs: [integrity] };
  },

  'placement.check': async (ctx, input) => {
    const designId = assertDesignId(input.design_id);
    const state = await loadDesign(ctx, designId);
    const urn = String(input.species_urn);
    speciesOf(ctx.kg, urn);
    const check = checkCandidate(
      state,
      {
        speciesUrn: urn,
        x: Number(input.x),
        y: Number(input.y),
        footprintM: input.footprint_m === undefined ? undefined : Number(input.footprint_m),
        ignorePlacementId: input.ignore_placement_id === undefined ? undefined : String(input.ignore_placement_id),
      },
      ctx.kg,
      ctx.rules,
    );
    return { designId, seq: state.seq, ...check };
  },

  'placement.suggest': async (ctx, input) => {
    const designId = assertDesignId(input.design_id);
    const state = await loadDesign(ctx, designId);
    const x = Number(input.x);
    const y = Number(input.y);
    requireInside(state.site, x, y);
    const suggestion = suggestCandidates(state, ctx.kg, { x, y }, { limit: Number(input.limit ?? 8) }, ctx.rules);
    return { designId, seq: state.seq, ...suggestion };
  },

  'design.create': async (ctx, input, meta) => {
    const key = meta.idempotencyKey ?? '';
    const designId = `d_${sha256Hex(key).slice(0, 16)}`;
    if (await ctx.store.hasDesign(designId)) {
      const existing = await loadDesign(ctx, designId);
      return { designId, replayed: true, seq: existing.seq, state: publicDesign(existing) };
    }
    const starter = input.template === 'starter_pollinator';
    const site: SiteState = {
      name: String(input.name),
      widthM: Number(input.width_m),
      depthM: Number(input.depth_m),
      hardinessZone: (input.hardiness_zone as number | undefined) ?? (starter ? STARTER_GARDEN.site.hardinessZone : undefined),
      sunHours: (input.sun_hours as number | undefined) ?? (starter ? STARTER_GARDEN.site.sunHours : undefined),
      soilPh: (input.soil_ph as number | undefined) ?? (starter ? STARTER_GARDEN.site.soilPh : undefined),
    };
    const placements: PlacementState[] = starter
      ? STARTER_GARDEN.placements.map((p) => {
          const urn = `urn:ppp:species:${p.speciesSlug}`;
          return {
            id: `p_${p.key}`,
            speciesUrn: urn,
            x: p.x,
            y: p.y,
            footprintM: defaultFootprint(ctx.kg, speciesOf(ctx.kg, urn).urn, ctx.rules).footprintM,
            pinned: false,
          };
        })
      : [];
    const result = await ctx.store.append(
      designId,
      {
        type: 'DesignCreated',
        actor: actorOf(meta),
        idempotency_key: key,
        payload: { designId, name: site.name, site, placements },
      },
      { expectedSeq: 0 },
    );
    return { designId, replayed: result.replayed, seq: result.event.seq, state: publicDesign(result.state) };
  },

  'design.update_site': async (ctx, input, meta) => {
    const designId = assertDesignId(input.design_id);
    const prior = await priorEvent(ctx, designId, meta.idempotencyKey);
    if (prior) return { designId, seq: prior.seq, replayed: true, changed: false };
    const state = await loadDesign(ctx, designId);
    const changes: Partial<SiteState> = {};
    const previous: Record<string, unknown> = {};
    for (const [inputKey, siteKey] of Object.entries(SITE_FIELDS)) {
      const value = input[inputKey];
      if (value === undefined) continue;
      (changes as Record<string, unknown>)[siteKey] = value;
      previous[siteKey] = state.site[siteKey];
    }
    if (Object.keys(changes).length === 0) {
      throw new CapabilityError('validation_error', 'Provide at least one site condition to change');
    }
    const result = await ctx.store.append(
      designId,
      { type: 'SiteUpdated', actor: actorOf(meta), idempotency_key: meta.idempotencyKey, payload: { changes, previous } },
      { expectedSeq: input.base_seq as number | undefined },
    );
    return { designId, seq: result.event.seq, replayed: result.replayed, changed: true, site: result.state.site };
  },

  'design.add_placement': async (ctx, input, meta) => {
    const designId = assertDesignId(input.design_id);
    const prior = await priorEvent(ctx, designId, meta.idempotencyKey);
    if (prior) return { designId, seq: prior.seq, replayed: true };
    const state = await loadDesign(ctx, designId);
    const urn = String(input.species_urn);
    speciesOf(ctx.kg, urn);
    const x = Number(input.x);
    const y = Number(input.y);
    requireInside(state.site, x, y);
    const placementId = input.placement_id === undefined
      ? `p_${sha256Hex(`${designId}|${meta.idempotencyKey ?? ''}`).slice(0, 12)}`
      : assertPlacementId(String(input.placement_id));
    if (Object.hasOwn(state.placements, placementId)) {
      throw new CapabilityError('conflict', `Placement ${placementId} already exists`, { placementId, currentSeq: state.seq });
    }
    const placement: PlacementState = {
      id: placementId,
      speciesUrn: urn,
      x,
      y,
      footprintM: input.footprint_m === undefined ? defaultFootprint(ctx.kg, urn, ctx.rules).footprintM : Number(input.footprint_m),
      pinned: input.pinned === true,
    };
    const result = await ctx.store.append(
      designId,
      { type: 'PlacementAdded', actor: actorOf(meta), idempotency_key: meta.idempotencyKey, payload: { placement } },
      { expectedSeq: input.base_seq as number | undefined },
    );
    return { designId, seq: result.event.seq, replayed: result.replayed, placement };
  },

  'design.update_placement': async (ctx, input, meta) => {
    const designId = assertDesignId(input.design_id);
    const placementId = assertPlacementId(String(input.placement_id));
    const prior = await priorEvent(ctx, designId, meta.idempotencyKey);
    if (prior) return { designId, seq: prior.seq, replayed: true, changed: false };
    const state = await loadDesign(ctx, designId);
    if (!Object.hasOwn(state.placements, placementId)) {
      throw new CapabilityError('not_found', `Placement ${placementId} does not exist`, { placementId });
    }
    const current = state.placements[placementId];
    const changes: Partial<Omit<PlacementState, 'id'>> = {};
    if (input.species_urn !== undefined && input.species_urn !== current.speciesUrn) {
      changes.speciesUrn = speciesOf(ctx.kg, String(input.species_urn)).urn;
    }
    const x = input.x === undefined ? current.x : Number(input.x);
    const y = input.y === undefined ? current.y : Number(input.y);
    if (x !== current.x || y !== current.y) {
      requireInside(state.site, x, y);
      if (x !== current.x) changes.x = x;
      if (y !== current.y) changes.y = y;
    }
    if (input.footprint_m !== undefined && Number(input.footprint_m) !== current.footprintM) {
      changes.footprintM = Number(input.footprint_m);
    }
    if (input.pinned !== undefined && input.pinned !== current.pinned) changes.pinned = input.pinned === true;
    if (Object.keys(changes).length === 0) {
      return { designId, seq: state.seq, replayed: false, changed: false, placement: current };
    }
    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(changes) as (keyof typeof changes)[]) previous[key] = current[key];
    const result = await ctx.store.append(
      designId,
      {
        type: 'PlacementUpdated',
        actor: actorOf(meta),
        idempotency_key: meta.idempotencyKey,
        payload: { placementId, changes, previous },
      },
      { expectedSeq: input.base_seq as number | undefined },
    );
    return {
      designId,
      seq: result.event.seq,
      replayed: result.replayed,
      changed: true,
      placement: result.state.placements[placementId],
    };
  },

  'design.remove_placement': async (ctx, input, meta) => {
    const designId = assertDesignId(input.design_id);
    const placementId = assertPlacementId(String(input.placement_id));
    const prior = await priorEvent(ctx, designId, meta.idempotencyKey);
    if (prior) return { designId, seq: prior.seq, replayed: true };
    const state = await loadDesign(ctx, designId);
    if (!Object.hasOwn(state.placements, placementId)) {
      throw new CapabilityError('not_found', `Placement ${placementId} does not exist`, { placementId });
    }
    const removed = state.placements[placementId];
    const result = await ctx.store.append(
      designId,
      { type: 'PlacementRemoved', actor: actorOf(meta), idempotency_key: meta.idempotencyKey, payload: { placement: removed } },
      { expectedSeq: input.base_seq as number | undefined },
    );
    return { designId, seq: result.event.seq, replayed: result.replayed, removed };
  },

  'design.archive': async (ctx, input, meta) => {
    if (input.confirm !== true) {
      throw new CapabilityError('confirmation_required', 'Archiving is a human-gated action: send confirm: true to proceed');
    }
    const designId = assertDesignId(input.design_id);
    const prior = await priorEvent(ctx, designId, meta.idempotencyKey);
    if (prior) return { designId, seq: prior.seq, archived: true, replayed: true, changed: false };
    const state = await loadDesign(ctx, designId);
    if (state.archived) return { designId, seq: state.seq, archived: true, replayed: false, changed: false };
    const result = await ctx.store.append(
      designId,
      { type: 'DesignArchived', actor: actorOf(meta), idempotency_key: meta.idempotencyKey, payload: {} },
      { expectedSeq: input.base_seq as number | undefined },
    );
    return { designId, seq: result.event.seq, archived: true, replayed: result.replayed, changed: true };
  },

  'archive.export_plain': async (ctx) => {
    const summary = await exportPlainArchive({
      store: ctx.store,
      feedback: ctx.feedback,
      knowledgeDir: ctx.knowledgeDir,
      rulesFile: ctx.rulesFile,
      outDir: ctx.archiveDir,
      kg: ctx.kg,
      generatedAt: ctx.now().toISOString(),
    });
    return {
      outDir: summary.outDir,
      designs: summary.designs,
      species: summary.species,
      fileCount: summary.files.length,
      files: summary.files,
    };
  },

  'feedback.record': async (ctx, input, meta) => {
    const designId = assertDesignId(input.design_id);
    const state = await loadDesign(ctx, designId);
    const placementId = input.placement_id === undefined ? null : assertPlacementId(String(input.placement_id));
    if (placementId !== null && !Object.hasOwn(state.placements, placementId)) {
      throw new CapabilityError('not_found', `Placement ${placementId} does not exist`, { placementId });
    }
    const key = meta.idempotencyKey ?? '';
    const reasonTag = String(input.reason_tag) as FeedbackReasonTag;
    const result = await ctx.feedback.append({
      actor: actorOf(meta),
      idempotencyKey: key,
      payload: {
        id: `fb_${sha256Hex(key).slice(0, 16)}`,
        designId,
        placementId,
        rule: String(input.rule),
        reasonTag,
        note: String(input.note ?? ''),
        graphVersion: ctx.kg.graphVersion,
        ruleConfigVersion: ctx.rules.version,
        modelVersion: MODEL_VERSION,
      },
    });
    return {
      id: result.entry.payload.id,
      seq: result.entry.seq,
      replayed: result.replayed,
      record: feedbackItem(result.entry),
      route: routeFeedback(reasonTag),
    };
  },

  'feedback.list': async (ctx, input) => {
    const log = await ctx.feedback.read();
    if (!log.chainOk) throw new CapabilityError('integrity_error', `feedback log failed its integrity check: ${log.problem}`);
    const designFilter = input.design_id === undefined ? undefined : assertDesignId(input.design_id);
    const routeFilter = input.route === undefined ? undefined : String(input.route);
    const items = log.entries
      .map(feedbackItem)
      .filter((item) => (designFilter === undefined || item.designId === designFilter) && (routeFilter === undefined || item.route === routeFilter));
    return { count: items.length, items: items.slice(-Number(input.limit ?? 100)) };
  },
};
