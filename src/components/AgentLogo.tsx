import type { AgentKind } from '../../shared/agent-types';
import { AGENT_INFO } from '../../shared/agent-types';

interface AgentLogoProps {
  kind: AgentKind;
  size?: number;
}

// Small abstract marks, not the agents' real trademarks — just distinct,
// recognizable glyphs so the switcher reads at a glance.
function Glyph({ kind }: { kind: AgentKind }) {
  switch (kind) {
    case 'claude':
      // Simple 8-point sunburst.
      return (
        <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (Math.PI / 4) * i;
            const x1 = 12 + Math.cos(angle) * 3.2;
            const y1 = 12 + Math.sin(angle) * 3.2;
            const x2 = 12 + Math.cos(angle) * 6.5;
            const y2 = 12 + Math.sin(angle) * 6.5;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
      );
    case 'codex':
      // Angle-bracket "code" mark.
      return (
        <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 8l-3.5 4L9 16" />
          <path d="M15 8l3.5 4L15 16" />
        </g>
      );
    case 'kimi':
      // Crescent moon.
      return <path d="M14.5 6.5a6 6 0 100 11 7 7 0 010-11z" fill="#fff" />;
  }
}

export default function AgentLogo({ kind, size = 20 }: AgentLogoProps) {
  const { label, color } = AGENT_INFO[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
      <circle cx="12" cy="12" r="12" fill={color} />
      <Glyph kind={kind} />
    </svg>
  );
}
