import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, site } from './config';
import Logo from './Logo';
import HeroMedia from './HeroMedia';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
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
  const header = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), reduced ? 0 : motion.introDuration);
    return () => clearTimeout(timer);
  }, [reduced]);

  useEffect(() => {
    document.documentElement.classList.toggle('is-intro', !ready);
    return () => document.documentElement.classList.remove('is-intro');
  }, [ready]);

  useEffect(() => {
    if (!header.current) return;
    const measure = () => document.documentElement.style.setProperty('--header-height', `${header.current!.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header.current);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--header-height');
    };
  }, []);

  useEffect(() => {
    if (!ready || !hero.current || !track.current) return;
    let raf = 0;
    let last = performance.now();
    let marqueeOffset = 0;
    let elapsed = 0;
    let viewport = { w: innerWidth, h: innerHeight, hero: hero.current.offsetHeight, unit: 1, mobile: false };
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
    const frame = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const active = !pausedRef.current && !reduced;
      if (active) elapsed += dt;
      const entering = reduced ? 0 : viewport.w * Math.pow(1 - clamp(elapsed / motion.revealDuration), 3);
      if (active && elapsed > motion.revealDuration) marqueeOffset = (marqueeOffset + motion.marqueeSpeed * dt / 1000) % viewport.unit;
      track.current!.style.transform = `translate3d(${entering - marqueeOffset}px, 0, 0)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', measure);
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
      <header ref={header} className="header reveal" style={{ '--delay': '0ms' } as React.CSSProperties}>
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
    <section className="hero" ref={hero} id="main" aria-label="Выставочные стенды">
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
    <section id="projects" className="project-section" aria-label="Видео выставочных стендов Expo Hunters">
      <h2 className="sr-only">Выставочные стенды Expo Hunters</h2>
      <HeroMedia hero={hero} header={header} ready={ready} paused={paused} reduced={reduced} />
    </section>
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
