import { useEffect, useRef, useState } from 'react';
import type { Post } from '../types';
import { getMediaUrl, postThumbUrl } from '../utils/media';
import './CarouselViewer.css';

interface CarouselViewerProps {
  post: Post;
  hasPrev: boolean;
  hasNext: boolean;
  /** -1 = previous post, +1 = next post of the filtered list */
  onNavigate: (dir: -1 | 1) => void;
  onDismiss: () => void;
  /** Direction the post was entered from (slide-in animation) */
  enterDir: -1 | 0 | 1;
}

interface Slide {
  id: string;
  image: string;
  thumb: string;
  video: string;
  alt: string;
}

function slidesFor(post: Post): Slide[] {
  if (post.isCarousel && post.carouselItems.length > 0) {
    return post.carouselItems.map((item, i) => ({
      id: item.id,
      image: getMediaUrl(item.displayUrl),
      thumb: getMediaUrl(item.thumbUrl) || (i === 0 ? postThumbUrl(post) : ''),
      video: item.isVideo ? getMediaUrl(item.videoUrl) : '',
      alt: item.altText || '',
    }));
  }
  return [{
    id: post.id,
    image: getMediaUrl(post.displayUrl),
    thumb: postThumbUrl(post),
    video: post.isVideo ? getMediaUrl(post.videoUrl) : '',
    alt: post.altText || '',
  }];
}

type Axis = 'x' | 'y' | 'none' | null;

/**
 * Media stage of the detail view. Horizontal swipe pages through carousel images first and
 * continues to the neighbouring post at the edges; swipe down dismisses. Originals and videos
 * are only loaded here (videos with preload="none").
 */
const CarouselViewer = ({ post, hasPrev, hasNext, onNavigate, onDismiss, enterDir }: CarouselViewerProps) => {
  const slides = slidesFor(post);
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({ x: 0, y: 0, t: 0, axis: null as Axis, id: -1 });

  // Step one image, or on to the next/previous post at the edges
  const step = (dir: -1 | 1) => {
    const target = index + dir;
    if (target >= 0 && target < slides.length) {
      setIndex(target);
    } else if (dir === 1 ? hasNext : hasPrev) {
      onNavigate(dir);
    }
  };

  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });

  // Keyboard navigation (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [role="dialog"].sheet')) return;
      if (e.key === 'ArrowLeft') stepRef.current(-1);
      if (e.key === 'ArrowRight') stepRef.current(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pause videos that slid out of view
  useEffect(() => {
    stageRef.current?.querySelectorAll('video').forEach((v, i) => {
      if (i !== index && !v.paused) v.pause();
    });
  }, [index]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Leave the native video controls (bottom bar: play/seek) alone
    const target = e.target as HTMLElement;
    if (target.tagName === 'VIDEO' && e.clientY > target.getBoundingClientRect().bottom - 64) return;
    if (target.closest('.media-nav')) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, axis: null, id: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.id !== e.pointerId || g.axis === 'none') return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (g.axis === null) {
      if (Math.hypot(mx, my) < 10) return;
      g.axis = Math.abs(mx) > Math.abs(my) ? 'x' : my > 0 ? 'y' : 'none';
      if (g.axis === 'none') return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    }
    if (g.axis === 'x') {
      const atEdge = (mx > 0 && index === 0 && !hasPrev) || (mx < 0 && index === slides.length - 1 && !hasNext);
      setDx(atEdge ? mx * 0.25 : mx);
    } else {
      setDy(Math.max(0, my));
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.id !== e.pointerId) return;
    g.id = -1;
    const width = stageRef.current?.clientWidth || window.innerWidth;
    const dt = Math.max(1, e.timeStamp - g.t);
    if (g.axis === 'x') {
      const fast = Math.abs(dx) > 30 && Math.abs(dx) / dt > 0.45;
      if (Math.abs(dx) > width * 0.2 || fast) step(dx < 0 ? 1 : -1);
    } else if (g.axis === 'y') {
      const fast = dy > 40 && dy / dt > 0.5;
      if (dy > 110 || fast) {
        onDismiss();
        return;
      }
    }
    setDx(0);
    setDy(0);
    setDragging(false);
  };

  // Moving within the carousel slides the track; at the edges the whole post follows the finger
  const withinCarousel = (dx < 0 && index < slides.length - 1) || (dx > 0 && index > 0);
  const trackOffset = withinCarousel ? dx : 0;
  const stageOffset = withinCarousel ? 0 : dx;

  const enterClass = enterDir === 1 ? 'enter-from-right' : enterDir === -1 ? 'enter-from-left' : '';

  return (
    <div
      ref={stageRef}
      className={`media-stage ${enterClass} ${dragging ? 'dragging' : ''}`}
      style={{
        transform: `translate(${stageOffset}px, ${dy}px) scale(${dy ? Math.max(0.85, 1 - dy / 1200) : 1})`,
        opacity: dy ? Math.max(0.4, 1 - dy / 500) : 1,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        className="media-track"
        style={{ transform: `translateX(calc(${-index * 100}% + ${trackOffset}px))` }}
      >
        {slides.map((slide, i) => {
          const near = Math.abs(i - index) <= 1;
          return (
            <div
              key={slide.id}
              className="media-slide"
              style={near && slide.thumb ? { backgroundImage: `url("${slide.thumb}")` } : undefined}
              aria-hidden={i !== index}
            >
              {near && (slide.video ? (
                <video
                  src={slide.video}
                  poster={slide.image || slide.thumb || undefined}
                  preload="none"
                  playsInline
                  controls
                  loop
                  className="media-el"
                />
              ) : slide.image ? (
                <img src={slide.image} alt={slide.alt} className="media-el" draggable={false} decoding="async" />
              ) : null)}
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
        <div className="media-dots" aria-label={`Bild ${index + 1} von ${slides.length}`}>
          {slides.map((slide, i) => (
            <span key={slide.id} className={`media-dot ${i === index ? 'active' : ''}`} />
          ))}
        </div>
      )}

      {/* Buttons for mouse users; touch users swipe */}
      {(index > 0 || hasPrev) && (
        <button className="media-nav media-nav-prev" onClick={() => step(-1)} aria-label="Zurück">‹</button>
      )}
      {(index < slides.length - 1 || hasNext) && (
        <button className="media-nav media-nav-next" onClick={() => step(1)} aria-label="Weiter">›</button>
      )}
    </div>
  );
};

export default CarouselViewer;
