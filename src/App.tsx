import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, site } from './config';
import Logo from './Logo';
import LiquidHover, { type LiquidMotion } from './LiquidHover';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const p = clamp(v); return p * p * (3 - 2 * p); };
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
type DialogKind = 'brief' | 'about' | 'production' | 'contacts';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return reduced;
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg aria-hidden="true" className="arrow" viewBox="0 0 24 24" fill="none">
    {diagonal ? <path d="M5 19 19 5M5 5h14v14" /> : <path d="M3 12h18m-8-8 8 8-8 8" />}
  </svg>;
}

function MarqueeUnit({ duplicate = false }: { duplicate?: boolean }) {
  return <div className="marquee-unit" aria-hidden={duplicate || undefined}>
    {duplicate ? <div className="headline"><span>ВЫСТАВОЧНЫЕ</span><span>СТЕНДЫ</span></div> : <h1 className="headline" aria-label="Выставочные стенды"><span>ВЫСТАВОЧНЫЕ</span><span>СТЕНДЫ</span></h1>}
    <p className="hero-description">Создаём выставочные<br />стенды, которые притягивают<br />внимание</p>
    <span className="marquee-dot" />
  </div>;
}

export default function App() {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [dialogKind, setDialogKind] = useState<DialogKind>('brief');
  const [briefPrepared, setBriefPrepared] = useState(false);
  const [preparedEmail, setPreparedEmail] = useState('');
  const hero = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const liquidMotion = useRef<LiquidMotion>({ dx: 0, dy: 0 });

  useEffect(() => {
    // Загрузка не зависит от сети: все изображения лежат в самом репозитории.
    const preload = new Image();
    preload.src = site.projectImage;
    const timer = window.setTimeout(() => setReady(true), reduced ? 0 : motion.introDuration);
    return () => clearTimeout(timer);
  }, [reduced]);

  useEffect(() => {
    document.documentElement.classList.toggle('is-intro', !ready);
    return () => document.documentElement.classList.remove('is-intro');
  }, [ready]);

  useEffect(() => {
    if (!ready || !hero.current || !track.current || !card.current) return;
    let raf = 0;
    let last = performance.now();
    const started = last;
    let marqueeOffset = 0;
    let elapsed = 0;
    let viewport = { w: innerWidth, h: innerHeight, hero: hero.current.offsetHeight, unit: 1, mobile: false };
    let pointer = { x: innerWidth * .69, y: innerHeight * .57 };
    let follower = { ...pointer };
    let previous = { ...pointer };
    const measure = () => {
      viewport = { w: innerWidth, h: innerHeight, hero: hero.current!.offsetHeight,
        unit: (track.current!.firstElementChild as HTMLElement).offsetWidth,
        mobile: innerWidth < 760 || matchMedia('(pointer: coarse)').matches };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(hero.current);
    observer.observe(track.current.firstElementChild!);
    window.addEventListener('resize', measure);
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.isPrimary) pointer = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    const frame = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const active = !pausedRef.current && !reduced;
      if (active) elapsed += dt;
      const mobile = viewport.mobile;
      const p = clamp(scrollY / viewport.hero);
      const docking = smooth(p / .34);
      const pad = viewport.w < 760 ? 16 : 20;
      const verticalPad = viewport.w < 760 ? 16 : 36;
      const baseWidth = mobile ? Math.min(viewport.w - 64, 368) : Math.min(viewport.w * .256, motion.followerWidth);
      const settle = active ? 1 - Math.pow(1 - motion.followerSmoothing, dt / (1000 / 60)) : 1;
      const desired = mobile ? { x: viewport.w / 2, y: Math.min(viewport.hero * .41, 450) } : active ? pointer : follower;
      follower.x = lerp(follower.x, desired.x, settle);
      follower.y = lerp(follower.y, desired.y, settle);
      const appearance = reduced ? 1 : smooth((now - started - 300) / 1050);
      const w = lerp(baseWidth * lerp(.36, 1, appearance), viewport.w - 2 * pad, Math.pow(p, 1.7));
      const finalHeight = mobile ? Math.min(viewport.h - 32, w * 9 / 16) : Math.min(viewport.h - 65, w * .55);
      const h = lerp(w / (16 / 9), finalHeight, smooth(p));
      const x = lerp(Math.max(pad, Math.min(viewport.w - baseWidth - pad, follower.x - baseWidth / 2)), pad, docking);
      const y = lerp(Math.max(100, Math.min(viewport.h - h - pad, follower.y - h / 2)), Math.max(verticalPad, viewport.hero - scrollY), docking);
      card.current!.style.width = `${w}px`;
      card.current!.style.height = `${h}px`;
      card.current!.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      card.current!.dataset.mode = p > .001 ? 'scroll' : 'follow';
      // Скорость в мировых координатах: деформация сохраняется, даже когда картинка движется вместе с мышью.
      liquidMotion.current = {
        dx: active && !mobile ? Math.max(-45, Math.min(45, (follower.x - previous.x) * (1 - docking))) : 0,
        dy: active && !mobile ? Math.max(-45, Math.min(45, (follower.y - previous.y) * (1 - docking))) : 0,
      };
      previous = { ...follower };
      const entering = reduced ? 0 : viewport.w * Math.pow(1 - clamp(elapsed / motion.revealDuration), 3);
      if (active && elapsed > motion.revealDuration) marqueeOffset = (marqueeOffset + motion.marqueeSpeed * dt / 1000) % viewport.unit;
      track.current!.style.transform = `translate3d(${entering - marqueeOffset}px, 0, 0)`;
      if (document.hidden) liquidMotion.current = { dx: 0, dy: 0 };
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [ready, reduced]);

  const openDialog = (kind: DialogKind) => {
    setDialogKind(kind);
    setBriefPrepared(false);
    dialog.current?.showModal();
    requestAnimationFrame(() => {
      if (kind === 'brief' && dialog.current?.open) dialog.current.querySelector('input')?.focus({ preventScroll: true });
    });
  };

  const submitBrief = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const body = `Здравствуйте! Хочу обсудить выставочный стенд.\n\nИмя: ${data.get('name')}\nКонтакт: ${data.get('contact')}\nПлощадь: ${data.get('area') || 'Пока не определена'} м²\nВыставка и пожелания: ${data.get('details') || 'Обсудим лично'}`;
    setPreparedEmail(`mailto:${site.email}?subject=${encodeURIComponent('Новый проект — выставочный стенд')}&body=${encodeURIComponent(body)}`);
    setBriefPrepared(true);
  };

  return <div className={`site ${ready ? 'is-ready' : ''} ${paused ? 'is-paused' : ''}`}>
    <a className="skip-link" href="#main">К содержимому</a>
    {!ready && <div className="intro" role="status" aria-label="Загрузка Expo Hunters"><Logo light /></div>}
    <section className="hero" ref={hero} id="main" aria-label="Выставочные стенды">
      <header className="header reveal" style={{ '--delay': '0ms' } as React.CSSProperties}>
        <a className="brand" href="#main" aria-label="Expo Hunters — на первый экран"><Logo /></a>
        <nav className="nav-primary" aria-label="Основная навигация">
          <a href="#projects">Проекты</a>
          <button onClick={() => openDialog('production')}>Производство</button>
        </nav>
        <button className="calculate" onClick={() => openDialog('brief')}><span>Рассчитать стенд<br />online</span><Arrow diagonal /></button>
        <nav className="nav-secondary" aria-label="О компании">
          <button onClick={() => openDialog('about')}>О нас</button>
          <button onClick={() => openDialog('contacts')}>Контакты</button>
        </nav>
        <div className="header-contacts">
          <a href={`mailto:${site.email}`}>{site.email}</a>
          <a href={`tel:${site.phoneHref}`}>{site.phone}</a>
        </div>
        <button className="mobile-menu" aria-label="Открыть меню и контакты" onClick={() => openDialog('contacts')}>Меню <Arrow diagonal /></button>
      </header>
      <main>
        <div className="marquee-window"><div className="marquee-track" ref={track}><MarqueeUnit /><MarqueeUnit duplicate /></div></div>
        <button className="project-cta reveal" style={{ '--delay': '450ms' } as React.CSSProperties} onClick={() => openDialog('brief')}>ОБСУДИТЬ ПРОЕКТ<Arrow /></button>
        <div className="features">
          <article className="feature feature-design reveal" style={{ '--delay': '650ms' } as React.CSSProperties}>
            <div className="feature-number">3-20</div><h2>вариантов дизайна</h2>
            <p>Проектируем, пока<br />не найдём решение,<br />которое сработает</p>
          </article>
          <article className="feature reveal" style={{ '--delay': '900ms' } as React.CSSProperties}>
            <h2>Аккредитованный<br />застройщик</h2><p>Все ключевые<br />площадки и выставки</p>
          </article>
          <div className="socials reveal" aria-label="Мессенджеры" style={{ '--delay': '1100ms' } as React.CSSProperties}>
            {Object.entries(site.socials).map(([name, url]) => url ? <a key={name} href={url} target="_blank" rel="noreferrer" aria-label={name}>{name}</a> :
              <button key={name} type="button" aria-label={`${name} — ссылка пока не добавлена`} title="Контакт мессенджера пока не предоставлен" disabled>{name}</button>)}
          </div>
          <article className="feature feature-production reveal" style={{ '--delay': '1300ms' } as React.CSSProperties}>
            <h2>Производство<br /><span>2000 м²</span></h2><p>Реализуем проекты<br />любой сложности<br />и масштаба</p>
          </article>
          <article className="feature reveal" style={{ '--delay': '1550ms' } as React.CSSProperties}>
            <h2>Стенды под задачи<br />бизнеса</h2><p>Продуманный<br />сценарий работы<br />на выставке</p>
          </article>
        </div>
      </main>
    </section>
    <section id="projects" className="project-section" aria-label="Проект: выставочный стенд Яндекс Go">
      <h2 className="sr-only">Выставочный стенд Яндекс Go</h2>
      <img className="project-static" src={site.projectImage} alt={site.projectAlt} />
    </section>
    <div className="project-floating" ref={card} aria-hidden="true">
      <img className="project-photo" src={site.projectImage} alt="" />
      {ready && !reduced && !paused && <LiquidHover imageSrc={site.projectImage} motionRef={liquidMotion} resolution={motion.liquidResolution}
        cursorSize={motion.liquidRadius} intensity={motion.liquidIntensity} />}
    </div>
    <button className="motion-toggle" onClick={() => setPaused(!paused)} aria-pressed={paused}
      aria-label={paused ? 'Продолжить движение' : 'Остановить движение'} title={paused ? 'Продолжить движение' : 'Остановить движение'}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
        {paused ? <path d="m5 3 8 5-8 5Z" /> : <path d="M5 3v10M11 3v10" />}
      </svg>
    </button>
    <dialog ref={dialog} className="contact-dialog" aria-labelledby="dialog-heading" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <button className="dialog-close" onClick={() => dialog.current?.close()} aria-label="Закрыть">×</button>
      {dialogKind === 'brief' ? <>
        <p className="eyebrow">НАЧНЁМ С ВАШЕЙ ЗАДАЧИ</p><h2 id="dialog-heading">Обсудим<br />ваш проект.</h2>
        <form onSubmit={submitBrief} onChange={() => setBriefPrepared(false)}>
          <label>Как к вам обращаться<input name="name" autoComplete="name" placeholder="Ваше имя" required maxLength={120} /></label>
          <label>Как с вами связаться<input name="contact" placeholder="Телефон или email" autoComplete="email" required maxLength={160} /></label>
          <label>Площадь стенда, м²<input name="area" type="number" min="1" max="100000" placeholder="Если уже известна" /></label>
          <label>О проекте<textarea name="details" placeholder="Выставка, даты, идея или пожелания" rows={3} maxLength={3000} /></label>
          {briefPrepared ? <a href={preparedEmail} className="form-submit">Открыть письмо<Arrow diagonal /></a> : <button type="submit" className="form-submit">Подготовить письмо<Arrow diagonal /></button>}
          <p className="form-note" role="status">{briefPrepared ? 'Бриф готов. Нажмите «Открыть письмо», чтобы перейти в почтовую программу. Письмо нужно отправить самостоятельно.' : 'Подготовим бриф для вашей почтовой программы. Данные формы не сохраняются на сайте.'}</p>
        </form>
      </> : <>
        <p className="eyebrow">EXPO HUNTERS</p>
        <h2 id="dialog-heading">{dialogKind === 'production' ? <>Собственное<br />производство.</> : dialogKind === 'about' ? <>Стенды, которые<br />замечают.</> : <>Давайте<br />познакомимся.</>}</h2>
        <p className="dialog-description">{dialogKind === 'production' ? '2000 м² производства. Реализуем проекты любой сложности и масштаба. Расскажите о вашей выставке — обсудим возможности.' : dialogKind === 'about' ? 'Создаём выставочные стенды, которые притягивают внимание. От вариантов дизайна до реализации на площадке — под задачи вашего бизнеса.' : 'Обсудим вашу идею, выставку и задачи бизнеса. Напишите или позвоните нам.'}</p>
        <div className="dialog-nav"><a href="#projects" onClick={() => dialog.current?.close()}>Посмотреть проект <Arrow /></a><button onClick={() => openDialog('brief')}>Обсудить стенд <Arrow diagonal /></button>
          {dialogKind === 'contacts' && <><button onClick={() => openDialog('production')}>Производство <Arrow diagonal /></button><button onClick={() => openDialog('about')}>О нас <Arrow diagonal /></button></>}
        </div>
      </>}
      <div className="dialog-contacts"><a href={`mailto:${site.email}`}>{site.email}</a><a href={`tel:${site.phoneHref}`}>{site.phone}</a></div>
    </dialog>
  </div>;
}
