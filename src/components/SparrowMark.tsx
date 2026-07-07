interface SparrowMarkProps {
  size?: number;
}

export default function SparrowMark({ size = 28 }: SparrowMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Sparrow logo">
      <rect width="48" height="48" rx="10" fill="var(--accent)" />
      <path
        d="M12 28.5C19.6 17.2 29.7 13.4 38 15.1C32.2 18.2 28.8 23.2 27.8 31.6C24.9 27.8 19.8 27.2 12 28.5Z"
        fill="var(--accent-ink)"
      />
      <path d="M12 31.7C19.2 30.3 24.7 31.7 29.5 37C22.7 37.2 16.4 35.5 12 31.7Z" fill="var(--accent-ink)" opacity="0.78" />
      <path d="M17.5 18.8L23 14.2L21.6 22.1L17.5 18.8Z" fill="var(--surface)" opacity="0.92" />
      <circle cx="31" cy="18.4" r="1.45" fill="var(--surface)" />
    </svg>
  );
}
