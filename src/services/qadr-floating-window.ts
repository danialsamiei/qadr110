export interface FloatingWindowPosition {
  x: number;
  y: number;
}

export interface FloatingWindowSize {
  width: number;
  height: number;
}

export interface FloatingWindowStoredState {
  position: FloatingWindowPosition | null;
  size?: FloatingWindowSize | null;
}

export interface FloatingWindowClampOptions {
  padding?: number;
  bottomInset?: number;
  minWidth?: number;
  minHeight?: number;
}

export function loadFloatingWindowState(
  storageKey: string,
): FloatingWindowStoredState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { position: null };
    const parsed = JSON.parse(raw) as FloatingWindowStoredState;
    return {
      position: parsed?.position && Number.isFinite(parsed.position.x) && Number.isFinite(parsed.position.y)
        ? parsed.position
        : null,
      size: parsed?.size && Number.isFinite(parsed.size.width) && Number.isFinite(parsed.size.height)
        ? parsed.size
        : null,
    };
  } catch {
    return { position: null, size: null };
  }
}

export function saveFloatingWindowState(storageKey: string, state: FloatingWindowStoredState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

export function clampFloatingWindowPosition(
  containerRect: DOMRect,
  width: number,
  height: number,
  position: FloatingWindowPosition,
  options: FloatingWindowClampOptions = {},
): FloatingWindowPosition {
  const padding = options.padding ?? 12;
  const bottomInset = options.bottomInset ?? 76;
  const maxX = Math.max(padding, containerRect.width - width - padding);
  const maxY = Math.max(padding, containerRect.height - height - bottomInset);
  return {
    x: Math.min(maxX, Math.max(padding, position.x)),
    y: Math.min(maxY, Math.max(padding, position.y)),
  };
}

export function clampFloatingWindowSize(
  containerRect: DOMRect,
  width: number,
  height: number,
  options: FloatingWindowClampOptions = {},
): FloatingWindowSize {
  const padding = options.padding ?? 12;
  const bottomInset = options.bottomInset ?? 76;
  const minWidth = options.minWidth ?? 320;
  const minHeight = options.minHeight ?? 220;
  const maxWidth = Math.max(minWidth, containerRect.width - padding * 2);
  const maxHeight = Math.max(minHeight, containerRect.height - bottomInset - padding);
  return {
    width: Math.min(maxWidth, Math.max(minWidth, width)),
    height: Math.min(maxHeight, Math.max(minHeight, height)),
  };
}

export function pickFloatingWindowPosition(
  containerRect: DOMRect,
  width: number,
  height: number,
  occupiedRects: DOMRect[],
  preferredPositions: FloatingWindowPosition[],
  options: FloatingWindowClampOptions = {},
): FloatingWindowPosition {
  for (const candidate of preferredPositions) {
    const next = clampFloatingWindowPosition(containerRect, width, height, candidate, options);
    const rect = new DOMRect(next.x, next.y, width, height);
    const overlaps = occupiedRects.some((occupied) => !(
      rect.right < occupied.left ||
      rect.left > occupied.right ||
      rect.bottom < occupied.top ||
      rect.top > occupied.bottom
    ));
    if (!overlaps) return next;
  }

  return clampFloatingWindowPosition(
    containerRect,
    width,
    height,
    preferredPositions[0] ?? { x: 12, y: 12 },
    options,
  );
}

export function attachFloatingWindowDrag(
  handle: HTMLElement,
  target: HTMLElement,
  getContainerRect: () => DOMRect,
  onPositionChange: (position: FloatingWindowPosition) => void,
  getCurrentPosition: () => FloatingWindowPosition,
  options: FloatingWindowClampOptions = {},
): () => void {
  let dragging = false;
  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;
  let start = getCurrentPosition();

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || pointerId !== event.pointerId) return;
    const containerRect = getContainerRect();
    const next = clampFloatingWindowPosition(
      containerRect,
      target.offsetWidth,
      target.offsetHeight,
      {
        x: start.x + (event.clientX - originX),
        y: start.y + (event.clientY - originY),
      },
      options,
    );
    onPositionChange(next);
  };

  const finishDrag = (): void => {
    dragging = false;
    pointerId = null;
    handle.classList.remove('is-dragging');
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    finishDrag();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    start = getCurrentPosition();
    handle.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', finishDrag);

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', finishDrag);
  };
}
