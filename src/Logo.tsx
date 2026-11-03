// Векторная реконструкция по референсу; заменить экспортом фирменного SVG из Figma.
export default function Logo({ light = false }: { light?: boolean }) {
  return <svg className="logo" viewBox="0 0 408 62" role="img" aria-label="Expo Hunters">
    {[29, 78, 127, 176].map((cx, i) => <g key={cx}>
      <circle cx={cx} cy="31" r="28" fill="#ce2028" stroke="white" strokeWidth="0.8" />
      {i < 3 && <text x={cx} y="48" textAnchor="middle" fill="white" fontFamily="Arial, sans-serif" fontSize="53" fontWeight="300">{['e', 'x', 'p'][i]}</text>}
    </g>)}
    <g stroke="white" fill="none" strokeWidth="3">
      <circle cx="176" cy="31" r="12" /><path d="M176 12v7m0 24v7m-19-19h7m24 0h7" />
    </g>
    <circle cx="176" cy="31" r="3" fill="white" />
    <text x="218" y="49" fontFamily="Arial, sans-serif" fontSize="51" fontWeight="300" letterSpacing="1" fill={light ? '#fff' : '#292a2e'}>hunters</text>
  </svg>;
}
