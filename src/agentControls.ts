import type { AgentPromptOptions, AgentReasoningLevel } from '../shared/agent-types';

export type AgentModelSelection = 'default' | 'custom' | `catalog:${string}` | `catalog-base:${string}`;
export type AgentModeSelection = 'default' | (string & {});

export interface AgentCatalogModelOption {
  id: string;
  name: string;
}

export interface AgentCatalogModelEffort {
  level: AgentReasoningLevel | string;
  modelId: string;
  label: string;
}

export interface AgentCatalogModelGroup {
  value: AgentModelSelection;
  baseId: string;
  label: string;
  efforts: AgentCatalogModelEffort[];
  grouped: boolean;
}

const MODEL_EFFORT_RE = /^(?<base>.+?)\[(?<effort>[a-z][a-z0-9_-]*)\]$/i;
const MODEL_NAME_EFFORT_RE = /^(?<base>.+?)\s*\((?<effort>[a-z][a-z0-9_-]*)\)$/i;
const KNOWN_REASONING_LEVELS = new Set(['none', 'low', 'medium', 'high', 'xhigh']);
const PREFERRED_REASONING_ORDER = ['medium', 'high', 'xhigh', 'low', 'none'];

export function buildAgentPromptOptions(
  modelSelection: AgentModelSelection,
  customModelId: string,
  modeSelection: AgentModeSelection,
  reasoningLevel: AgentReasoningLevel,
): AgentPromptOptions {
  const options: AgentPromptOptions = { reasoningLevel };
  if (modelSelection.startsWith('catalog:')) {
    const modelId = modelSelection.slice('catalog:'.length).trim();
    if (modelId) options.modelId = modelId;
  } else if (modelSelection.startsWith('catalog-base:')) {
    throw new Error('Catalog base model selections must be resolved before sending an agent prompt.');
  } else if (modelSelection === 'custom') {
    const trimmedModel = customModelId.trim();
    if (trimmedModel) options.modelId = trimmedModel;
  }
  if (modeSelection !== 'default') options.modeId = modeSelection;
  return options;
}

export function reasoningInstruction(level: AgentReasoningLevel | undefined): string {
  switch (level) {
    case 'low':
      return '[Inkwell: Reasoning intensity requested: low. Prefer fast, direct answers.]';
    case 'medium':
      return '[Inkwell: Reasoning intensity requested: medium. Balance speed with careful checking.]';
    case 'high':
      return '[Inkwell: Reasoning intensity requested: high. Use deep reasoning for document understanding and edits.]';
    case 'xhigh':
      return '[Inkwell: Reasoning intensity requested: xhigh. Use the deepest available reasoning for difficult document understanding and edits.]';
    default:
      return '';
  }
}

export function groupCatalogModels(models: AgentCatalogModelOption[]): AgentCatalogModelGroup[] {
  const grouped = new Map<string, AgentCatalogModelGroup>();
  const result: AgentCatalogModelGroup[] = [];

  for (const model of models) {
    const parsed = parseCatalogModelEffort(model);
    if (!parsed) {
      result.push({
        value: `catalog:${model.id}`,
        baseId: model.id,
        label: model.name || model.id,
        efforts: [],
        grouped: false,
      });
      continue;
    }

    const existing =
      grouped.get(parsed.baseId) ??
      ({
        value: `catalog-base:${parsed.baseId}`,
        baseId: parsed.baseId,
        label: parsed.baseName,
        efforts: [],
        grouped: true,
      } satisfies AgentCatalogModelGroup);
    existing.efforts.push({
      level: parsed.effort,
      modelId: model.id,
      label: formatReasoningLevel(parsed.effort),
    });
    if (!grouped.has(parsed.baseId)) {
      grouped.set(parsed.baseId, existing);
      result.push(existing);
    }
  }

  return result.map((group) =>
    group.grouped
      ? {
          ...group,
          efforts: sortModelEfforts(group.efforts),
        }
      : group,
  );
}

export function resolveCatalogModelSelection(
  modelSelection: AgentModelSelection,
  reasoningLevel: AgentReasoningLevel,
  models: AgentCatalogModelOption[],
  currentModelId?: string,
): AgentModelSelection {
  if (!modelSelection.startsWith('catalog-base:')) return modelSelection;
  const baseId = modelSelection.slice('catalog-base:'.length);
  const group = groupCatalogModels(models).find((model) => model.baseId === baseId);
  if (!group?.efforts.length) return 'default';

  if (reasoningLevel !== 'auto') {
    const explicit = group.efforts.find((effort) => effort.level === reasoningLevel);
    if (explicit) return `catalog:${explicit.modelId}`;
  }

  const current = group.efforts.find((effort) => effort.modelId === currentModelId);
  if (current) return `catalog:${current.modelId}`;

  for (const preferred of PREFERRED_REASONING_ORDER) {
    const match = group.efforts.find((effort) => effort.level === preferred);
    if (match) return `catalog:${match.modelId}`;
  }

  return `catalog:${group.efforts[0].modelId}`;
}

export function reasoningOptionsForModel(
  modelSelection: AgentModelSelection,
  models: AgentCatalogModelOption[],
): Array<{ value: AgentReasoningLevel; label: string }> {
  const defaults: Array<{ value: AgentReasoningLevel; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'XHigh' },
  ];
  if (!modelSelection.startsWith('catalog-base:')) return defaults;

  const baseId = modelSelection.slice('catalog-base:'.length);
  const group = groupCatalogModels(models).find((model) => model.baseId === baseId);
  if (!group?.efforts.length) return defaults;

  const options = group.efforts
    .filter((effort) => isAgentReasoningLevel(effort.level))
    .map((effort) => ({ value: effort.level as AgentReasoningLevel, label: effort.label }));
  return [{ value: 'auto', label: 'Auto' }, ...options];
}

export function describeCatalogModelId(modelId: string, models: AgentCatalogModelOption[]): string {
  const model = models.find((candidate) => candidate.id === modelId);
  const parsed = model ? parseCatalogModelEffort(model) : parseCatalogModelEffort({ id: modelId, name: modelId });
  if (!parsed) return model?.name || modelId;
  return `${parsed.baseName} · ${formatReasoningLevel(parsed.effort)}`;
}

function parseCatalogModelEffort(
  model: AgentCatalogModelOption,
): { baseId: string; baseName: string; effort: string } | null {
  const idMatch = model.id.match(MODEL_EFFORT_RE);
  if (!idMatch?.groups) return null;
  const effort = idMatch.groups.effort.toLowerCase();
  if (!KNOWN_REASONING_LEVELS.has(effort)) return null;

  const nameMatch = model.name.match(MODEL_NAME_EFFORT_RE);
  const nameEffort = nameMatch?.groups?.effort.toLowerCase();
  return {
    baseId: idMatch.groups.base,
    baseName: nameEffort === effort ? nameMatch?.groups?.base.trim() || idMatch.groups.base : model.name,
    effort,
  };
}

function sortModelEfforts(efforts: AgentCatalogModelEffort[]): AgentCatalogModelEffort[] {
  return [...efforts].sort((a, b) => effortRank(String(a.level)) - effortRank(String(b.level)));
}

function effortRank(level: string): number {
  const index = PREFERRED_REASONING_ORDER.indexOf(level);
  return index === -1 ? PREFERRED_REASONING_ORDER.length : index;
}

function formatReasoningLevel(level: string): string {
  if (level === 'none') return 'None';
  if (level === 'xhigh') return 'XHigh';
  return level.slice(0, 1).toUpperCase() + level.slice(1);
}

function isAgentReasoningLevel(level: string): boolean {
  return level === 'none' || level === 'low' || level === 'medium' || level === 'high' || level === 'xhigh';
}
