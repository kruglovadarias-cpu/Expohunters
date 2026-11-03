// Оригиналы PNG без изменений извлечены из «Для кодекса.fig».
export default function Logo({ light = false }: { light?: boolean }) {
  const variant = light ? 'light' : 'dark';
  const base = `${import.meta.env.BASE_URL}images/expo-hunters-${variant}`;
  return <img className="logo" src={`${base}.png`}
    srcSet={`${base}-small.png 505w, ${base}.png 4034w`}
    sizes={light ? '(max-width: 560px) 72vw, 403px' : '(max-width: 759px) 185px, 247px'}
    width="4034" height="576" alt="Expo Hunters" />;
}
