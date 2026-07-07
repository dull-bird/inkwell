export type SkillSource = 'curated' | 'community' | 'local';
export type SkillInstallScope = 'sparrow-app-local';

export interface SparrowSkill {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  tags: string[];
  installed: boolean;
  author: string;
  license: string;
  homepageUrl?: string;
  repositoryUrl?: string;
  installScope: SkillInstallScope;
  installPathHint: string;
}

const APP_LOCAL_SCOPE = {
  installScope: 'sparrow-app-local' as const,
  installPathHint: 'Sparrow user data directory / skills',
};

export const SPARROW_SKILLS: SparrowSkill[] = [
  {
    id: 'paper-research',
    name: 'Paper Research',
    description: 'Search papers, collect links, and download source PDFs before summarizing.',
    source: 'curated',
    tags: ['research', 'academic', 'download'],
    installed: true,
    author: 'Sparrow contributors',
    license: 'MIT',
    repositoryUrl: 'https://github.com/openai/openai-cookbook',
    ...APP_LOCAL_SCOPE,
  },
  {
    id: 'citation-review',
    name: 'Citation Review',
    description: 'Find claims that need citations and prepare annotation suggestions.',
    source: 'curated',
    tags: ['research', 'review', 'annotation'],
    installed: false,
    author: 'Sparrow contributors',
    license: 'MIT',
    repositoryUrl: 'https://github.com/allenai/s2-folks',
    ...APP_LOCAL_SCOPE,
  },
  {
    id: 'redaction-check',
    name: 'Redaction Check',
    description: 'Detect personal data and risky visible text before export.',
    source: 'curated',
    tags: ['redaction', 'privacy', 'export'],
    installed: false,
    author: 'Sparrow contributors',
    license: 'MIT',
    homepageUrl: 'https://pymupdf.readthedocs.io/en/latest/recipes-common-issues-and-their-solutions.html',
    ...APP_LOCAL_SCOPE,
  },
  {
    id: 'form-workflow',
    name: 'Form Workflow',
    description: 'Extract, fill, and validate PDF form fields.',
    source: 'local',
    tags: ['forms', 'editing'],
    installed: true,
    author: 'Sparrow contributors',
    license: 'MIT',
    homepageUrl: 'https://pymupdf.readthedocs.io/en/latest/widget.html',
    ...APP_LOCAL_SCOPE,
  },
  {
    id: 'long-pdf-memory-index',
    name: 'Long PDF Memory Index',
    description: 'Chunk long documents, build page-cited local memory, and retrieve only relevant passages after AI is enabled.',
    source: 'curated',
    tags: ['long-pdf', 'memory', 'retrieval'],
    installed: false,
    author: 'Sparrow contributors',
    license: 'MIT',
    repositoryUrl: 'https://github.com/run-llama/llama_index',
    ...APP_LOCAL_SCOPE,
  },
  {
    id: 'github-skill-search',
    name: 'Community Skill Search',
    description: 'Search community PDF and research automation skills from user-approved source registries.',
    source: 'community',
    tags: ['github', 'community', 'search'],
    installed: false,
    author: 'Community authors',
    license: 'Varies',
    repositoryUrl: 'https://github.com/topics/agent-skills',
    ...APP_LOCAL_SCOPE,
  },
];

export function filterSkillCatalog(skills: SparrowSkill[], query: string): SparrowSkill[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return skills;
  return skills.filter((skill) => {
    const haystack = [
      skill.name,
      skill.description,
      skill.source,
      skill.author,
      skill.license,
      skill.homepageUrl,
      skill.repositoryUrl,
      ...skill.tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}
