const BLUE = '#0B6FDE';
const GREEN = '#167F3C';

export function LogoMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9"  cy="9"  r="8" fill={BLUE} />
      <circle cx="25" cy="9"  r="8" fill={BLUE} />
      <circle cx="9"  cy="25" r="8" fill={GREEN} />
      <rect x="17" y="17" width="16" height="16" rx="5" fill={GREEN} />
    </svg>
  );
}

export function LogoFull({ height = 22 }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <LogoMark size={height} />
      <span style={{ fontSize: height * 0.72, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1 }}>
        <span style={{ color: BLUE }}>DOT</span>{' '}
        <span style={{ color: GREEN }}>DOMINO</span>
      </span>
    </div>
  );
}
