// Здесь собраны параметры, которые будем менять при следующих правках.
export const site = {
  email: 'hunter@expohunters.ru',
  phone: '+7 (495) 504-65-75',
  phoneHref: '+74955046575',
  // Оригинал 1280×720 из предоставленного файла «Для кодекса.fig».
  projectImage: `${import.meta.env.BASE_URL}images/yandex-go.png`,
  projectAlt: 'Выставочный стенд Яндекс Go с жёлтой подсветкой',
  // Ссылки не выдумываем: кнопки активируются после добавления реальных URL.
  socials: { WA: '', TG: '', MAX: '' },
};

export const motion = {
  introDuration: 1100,
  revealDuration: 1500,
  marqueeSpeed: 78, // пикселей в секунду
  followerWidth: 368,
  followerSmoothing: 0.085,
  liquidIntensity: 86, // из приложенного пресета Originkit
  liquidResolution: 3,
  liquidRadius: 95,
};
