import {useRef, type MouseEvent, type PointerEvent} from 'react';

const SWIPE_PX = 56;

export function swipeDirection(
  start: {x: number; y: number},
  end: {x: number; y: number},
): -1 | 1 | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) {
    return null;
  }
  return dx < 0 ? 1 : -1;
}

export function useHorizontalSwipe(onSwipe: (direction: -1 | 1) => void) {
  const start = useRef<{x: number; y: number} | null>(null);
  const swallowClick = useRef(false);

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === 'mouse') {
        return;
      }
      start.current = {x: event.clientX, y: event.clientY};
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!start.current) {
        return;
      }
      const direction = swipeDirection(start.current, {x: event.clientX, y: event.clientY});
      start.current = null;
      if (!direction) {
        return;
      }
      swallowClick.current = true;
      onSwipe(direction);
    },
    onPointerCancel() {
      start.current = null;
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!swallowClick.current) {
        return;
      }
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    style: {touchAction: 'pan-y' as const},
  };
}
