// Здесь собраны параметры, которые будем менять при следующих правках.
export const site = {
  email: 'hunter@expohunters.ru',
  phone: '+7 (495) 504-65-75',
  phoneHref: '+74955046575',
  // Реальный ролик первого экрана expohunters.com, локальная копия без звука.
  projectVideo: `${import.meta.env.BASE_URL}videos/expo-hunters-hero.mp4`,
  projectVideoLabel: 'Видео выставочных стендов Expo Hunters',
  // Ссылки не выдумываем: кнопки активируются после добавления реальных URL.
  socials: { WA: '', TG: '', MAX: '' },
};

// Фотоэталон: 86. Текущий эффект — 40% от предыдущего значения 43.
const photoReferenceIntensity = 86;
export const motion = {
  introDuration: 1100,
  revealDuration: 1500,
  marqueeSpeed: 78, // пикселей в секунду
  followerWidth: 368 * 1.5,
  followerViewportRatio: .256 * 1.5,
  followerSmoothing: 0.085,
  liquidReferenceIntensity: photoReferenceIntensity,
  liquidIntensity: photoReferenceIntensity * .5 * .4,
  liquidResolution: 2,
  liquidRadius: 95,
  controlGap: 24,
  scrollSmoothing: 95, // миллисекунды, без задержки начала увеличения
};
