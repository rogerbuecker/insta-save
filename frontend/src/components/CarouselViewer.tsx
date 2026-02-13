import { useState, useEffect } from 'react';
import type { CarouselItem } from '../types';
import { getMediaUrl } from '../utils/media';
import './CarouselViewer.css';

interface CarouselViewerProps {
  items: CarouselItem[];
  initialIndex?: number;
}

const CarouselViewer: React.FC<CarouselViewerProps> = ({ items, initialIndex = 0 }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const goToIndex = (index: number) => {
    setCurrentIndex(index);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!items || items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];
  const displayUrl = getMediaUrl(currentItem.displayUrl);
  const videoUrl = currentItem.videoUrl ? getMediaUrl(currentItem.videoUrl) : '';

  return (
    <div className="carousel-viewer">
      <div className="carousel-counter">
        {currentIndex + 1} / {items.length}
      </div>

      <div className="carousel-main">
        {currentItem.isVideo ? (
          <video
            key={currentItem.id}
            src={videoUrl}
            poster={displayUrl}
            controls
            className="carousel-media"
            autoPlay
            loop
          />
        ) : (
          <img
            key={currentItem.id}
            src={displayUrl}
            alt={currentItem.altText || 'Carousel image'}
            className="carousel-media"
          />
        )}

        {items.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="carousel-nav carousel-nav-prev"
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              onClick={goToNext}
              className="carousel-nav carousel-nav-next"
              aria-label="Next image"
            >
              ›
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="carousel-thumbnails">
          {items.map((item, index) => {
            const thumbUrl = getMediaUrl(item.displayUrl);
            return (
              <button
                key={item.id}
                onClick={() => goToIndex(index)}
                className={`carousel-thumbnail ${index === currentIndex ? 'active' : ''}`}
              >
                <img src={thumbUrl} alt={`Thumbnail ${index + 1}`} />
                {item.isVideo && <span className="thumbnail-video-icon">▶</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CarouselViewer;
