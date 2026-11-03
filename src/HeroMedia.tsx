import { useEffect, useRef, type RefObject } from 'react';
import { motion, site } from './config';
import LiquidHover, { type LiquidMotion } from './LiquidHover';

interface Props {
  hero: RefObject<HTMLElement | null>;
  ready: boolean;
  paused: boolean;
  reduced: boolean;
}
type Rect = { x: number; y: number; w: number; h: number };
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p); };

// Позиция без transform появления, чтобы граница учитывала конечное положение кнопки.
function topWithin(element: HTMLElement, ancestor: HTMLElement) {
  let top = 0;
  for (let current: HTMLElement | null = element; current && current !== ancestor; current = current.offsetParent as HTMLElement | null) top += current.offsetTop;
  return top;
}

export default function HeroMedia({ hero, ready, paused, reduced }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const liquidMotion = useRef<LiquidMotion>({ dx: 0, dy: 0, strength: 1 });
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const media = video.current;
    if (!media) return;
    media.muted = true;
    if (!ready || paused || reduced) media.pause();
    else void media.play().catch(() => { /* Браузер может запретить autoplay в режиме энергосбережжения. */ });
  }, [ready, paused, reduced]);

  useEffect(() => {
    if (!ready || reduced || !hero.current || !card.current) return;
    const panel = card.current;
    const firstScreen = hero.current;
    let raf = 0;
    let last = performance.now();
    const started = last;
    let size = { w: innerWidth, h: innerHeight, hero: firstScreen.offsetHeight };
    let pointer = { x: size.w * .69, y: size.h * .57 };
    let center = { ...pointer };
    let previousCenter = { ...center };
    let rect: Rect = { x: 0, y: 0, w: Math.min(size.w * .256, motion.followerWidth) * .36, h: 0 };
    rect.h = rect.w * 9 / 16;
    let origin: Rect | null = null;
    let progress = 0;
    let lowerEdge = size.h - motion.controlGap;
    let upperEdge = 100;
    let cta = { right: 0, top: size.h };
    let mobile = false;

    // Защита только рядом с кнопкой: над соцсетями видео движется свободно.
    const lowerAt = (x: number, width: number) => mix(cta.top - motion.controlGap, lowerEdge,
      smooth((x - width / 2 - cta.right - motion.controlGap) / 96));

    const measure = () => {
      const old = size;
      size = { w: panel.parentElement?.clientWidth || innerWidth, h: innerHeight, hero: firstScreen.offsetHeight };
      mobile = size.w < 760 || matchMedia('(pointer: coarse)').matches;
      const header = firstScreen.querySelector<HTMLElement>('.header');
      upperEdge = Math.max(100, (header ? topWithin(header, firstScreen) + header.offsetHeight : 76) + motion.controlGap);
      const button = firstScreen.querySelector<HTMLElement>('.project-cta');
      cta = button ? { right: button.offsetLeft + button.offsetWidth, top: topWithin(button, firstScreen) } : { right: 0, top: size.h };
      lowerEdge = size.h - motion.controlGap;
      if (origin && (old.w !== size.w || old.h !== size.h)) {
        origin.w = Math.min(motion.followerWidth, origin.w * size.w / old.w, size.w - 32);
        origin.h = origin.w * 9 / 16;
        origin.x = clamp(origin.x * size.w / old.w, 16, Math.max(16, size.w - origin.w - 16));
        origin.y = clamp(origin.y * size.h / old.h, upperEdge, Math.max(upperEdge, lowerAt(origin.x + origin.w / 2, origin.w) - origin.h));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(firstScreen);
    for (const el of firstScreen.querySelectorAll<HTMLElement>('.header, .project-cta')) observer.observe(el);
    window.addEventListener('resize', measure);
    const move = (e: PointerEvent) => {
      if (e.isPrimary && e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', move, { passive: true });
    const frame = (now: number) => {
      const dt = Math.min(100, Math.max(1, now - last));
      last = now;
      const active = !pausedRef.current;
      const pad = size.w < 760 ? 16 : 20;
      const raw = clamp(scrollY / size.hero);
      if (raw > 0 && !origin) origin = { ...rect };
      const scrub = active ? 1 - Math.exp(-dt / motion.scrollSmoothing) : 1;
      progress = mix(progress, raw, scrub);
      if (Math.abs(raw - progress) < .0003) progress = raw;
      if (origin && raw === 0 && progress === 0) {
        center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
        previousCenter = { ...center };
        origin = null;
      }
      if (origin) {
        // Все четыре величины используют один прогресс: рамка растёт сразу со скроллом.
        const targetWidth = size.w - 2 * pad;
        const targetHeight = mobile ? Math.min(size.h - 32, targetWidth * 9 / 16) : Math.min(size.h - 65, targetWidth * .55);
        rect = { x: mix(origin.x, pad, progress), y: mix(origin.y, mobile ? 16 : 36, progress),
          w: mix(origin.w, targetWidth, progress), h: mix(origin.h, targetHeight, progress) };
      } else {
        const nominalWidth = mobile ? Math.min(size.w - 64, motion.followerWidth) : Math.min(size.w * .256, motion.followerWidth);
        const baseWidth = Math.min(nominalWidth, Math.max(1, lowerEdge - upperEdge) * 16 / 9);
        const appearance = smooth((now - started - 300) / 1050);
        rect.w = mix(rect.w, baseWidth * mix(.36, 1, appearance), 1 - Math.exp(-dt / 70));
        rect.h = rect.w * 9 / 16;
        const follow = 1 - Math.pow(1 - motion.followerSmoothing, dt / (1000 / 60));
        const desired = mobile ? { x: size.w / 2, y: size.hero * .41 } : active ? pointer : center;
        const target = { x: clamp(desired.x, pad + rect.w / 2, size.w - pad - rect.w / 2),
          y: clamp(desired.y, upperEdge + rect.h / 2, Math.max(upperEdge + rect.h / 2, lowerAt(desired.x, rect.w) - rect.h / 2)) };
        center = { x: mix(center.x, target.x, follow), y: mix(center.y, target.y, follow) };
        rect.x = clamp(center.x - rect.w / 2, pad, size.w - pad - rect.w);
        rect.y = clamp(center.y - rect.h / 2, upperEdge, Math.max(upperEdge, lowerAt(center.x, rect.w) - rect.h));
        center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      }
      panel.style.width = `${rect.w}px`;
      panel.style.height = `${rect.h}px`;
      panel.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      panel.dataset.mode = origin ? 'scroll' : 'follow';
      const strength = 1 - smooth(progress);
      liquidMotion.current = {
        dx: active && !mobile && !origin ? clamp(center.x - previousCenter.x, -35, 35) : 0,
        dy: active && !mobile && !origin ? clamp(center.y - previousCenter.y, -35, 35) : 0,
        strength,
        paused: !active,
      };
      previousCenter = { ...center };
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', move);
    };
  }, [ready, reduced, hero]);

  return <div className="media-viewport"><div className="project-floating" ref={card} data-intensity={motion.liquidIntensity}>
    <video ref={video} className="project-video" src={site.projectVideo} aria-label={site.projectVideoLabel}
      muted loop playsInline preload="auto" autoPlay={ready && !paused && !reduced} controls={reduced} />
    {ready && !reduced && finePointer && <LiquidHover videoRef={video} motionRef={liquidMotion}
      resolution={motion.liquidResolution} cursorSize={motion.liquidRadius}
      intensity={motion.liquidIntensity} referenceIntensity={motion.liquidReferenceIntensity} />}
  </div></div>;
}
