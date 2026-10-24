// bindPointer：拖鏡頭、雙指／滾輪縮放、450ms 長按搬移與 ghost 拖拉；回傳解除函式。

// ===== 指標手勢 =====

/** 綁定拖曳、雙指縮放、點擊與長按搬移，回傳解除監聽函式。 */
export function bindPointer(canvas, cam, h = {}) {
  const pts = new Map();
  const listeners = [];
  let drag;
  let pinch;
  let timer;

  /** 記錄每個畫布事件的解除函式，方便完整清理監聽。 */
  const on = (ev, fn, opts) => {
    canvas.addEventListener(ev, fn, opts);
    listeners.push(() => canvas.removeEventListener(ev, fn, opts));
  };

  /** 將指標事件的 client 座標換成世界座標。 */
  const world = e => cam.worldAt(e.clientX, e.clientY);
  on('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY
    });
    clearTimeout(timer);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        s: cam.s
      };
      drag = null;
      return;
    }
    if (pts.size !== 1) {
      return;
    }
    drag = {
      x: e.clientX,
      y: e.clientY,
      cx: cam.x,
      cy: cam.y,
      moved: false
    };
    const [x, y] = world(e);
    if (!h.blocked?.() && h.ghostHit?.(x, y)) {
      drag.ghost = true;
      h.onGhostGrab?.(x, y);
    } else {
      timer = setTimeout(() => {
        if (drag && !drag.moved && pts.size === 1 && !h.blocked?.() && h.onHold?.(x, y)) {
          drag.ghost = true;
          drag.moved = true;
          h.onGhostGrab?.(x, y);
        }
      }, 450);
    }
  });
  on('pointermove', e => {
    if (!pts.has(e.pointerId)) {
      if (!h.blocked?.()) {
        h.onHover?.(...world(e));
      }
      return;
    }
    pts.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY
    });
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const r = canvas.getBoundingClientRect();
      cam.zoomAt(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d) / cam.s, (a.x + b.x) / 2 - r.left, (a.y +
        b.y) / 2 - r.top);
      return;
    }
    if (!drag) {
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 8) {
      drag.moved = true;
      clearTimeout(timer);
    }
    if (drag.ghost) {
      h.onGhostDrag?.(...world(e));
      return;
    }
    if (drag.moved) {
      cam.x = drag.cx - dx / cam.s;
      cam.y = drag.cy - dy / cam.s;
      cam.clamp();
    }
  });

  /** 結束指標並取消長按；只有未拖曳的 pointerup 才算點擊。 */
  const end = e => {
    pts.delete(e.pointerId);
    clearTimeout(timer);
    if (pinch) {
      if (pts.size < 2) {
        pinch = null;
      }
      drag = null;
      return;
    }
    const tap = drag && !drag.moved && !drag.ghost;
    drag = null;
    if (tap && e.type === 'pointerup' && !h.blocked?.()) {
      h.onTap?.(...world(e));
    }
  };
  on('pointerup', end);
  on('pointercancel', end);
  on('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    cam.zoomAt(e.deltaY < 0 ? 1.12 : .89, e.clientX - r.left, e.clientY - r.top);
  }, {
    passive: false
  });
  return () => {
    clearTimeout(timer);
    listeners.forEach(f => f());
  };
}
