// Drag to reorder rows of different heights (recipe editor: ingredients, section headers, steps).
// Pointer events, so it works with a finger and a mouse; the drag starts only on a [data-handle].
// The row follows the pointer, the rows it passes slide by its height, and the scroller scrolls
// when the pointer is near its top or bottom edge. onDrop(fromIndex, toIndex) does the reorder.
export function initDrag(scroller, box, { rowSel, gap = 8, onStart, onDrop }) {
  let d = null;
  box.addEventListener("pointerdown", (e) => {
    const h = e.target.closest("[data-handle]");
    if (!h || !box.contains(h) || e.button > 0) return;
    const row = h.closest(rowSel);
    if (!row || row.parentElement !== box) return;
    e.preventDefault();
    if (document.activeElement && box.contains(document.activeElement)) document.activeElement.blur();
    const rows = [...box.children].filter((r) => r.matches(rowSel));
    const rects = rows.map((r) => r.getBoundingClientRect());
    const from = rows.indexOf(row);
    d = { row, rows, rects, from, to: from, startY: e.clientY, startScroll: scroller.scrollTop, y: e.clientY, raf: 0 };
    h.setPointerCapture(e.pointerId);
    row.classList.add("drag");
    rows.forEach((r) => { if (r !== row) r.classList.add("shift"); });
    if (onStart) onStart();
    if (navigator.vibrate) navigator.vibrate(8);
    const tick = () => {
      if (!d) return;
      const s = scroller.getBoundingClientRect();
      const edge = 56;
      if (d.y < s.top + edge) scroller.scrollTop -= 7;
      else if (d.y > s.bottom - edge) scroller.scrollTop += 7;
      move();
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
  });
  const move = () => {
    if (!d) return;
    const dy = d.y - d.startY + (scroller.scrollTop - d.startScroll);
    d.row.style.transform = "translateY(" + dy + "px)";
    const r0 = d.rects[d.from];
    const top = r0.top + dy, bottom = r0.bottom + dy;
    let to = d.from;
    d.rects.forEach((r, i) => {
      const m = r.top + r.height / 2;
      if (i < d.from && top < m) to = Math.min(to, i);
      if (i > d.from && bottom > m) to = Math.max(to, i);
    });
    d.to = to;
    const step = r0.height + gap;
    d.rows.forEach((r, i) => {
      if (r === d.row) return;
      let shift = 0;
      if (d.from < to && i > d.from && i <= to) shift = -step;
      if (d.from > to && i < d.from && i >= to) shift = step;
      r.style.transform = shift ? "translateY(" + shift + "px)" : "";
    });
  };
  box.addEventListener("pointermove", (e) => { if (d) { d.y = e.clientY; move(); } });
  const end = () => {
    if (!d) return;
    cancelAnimationFrame(d.raf);
    const { rows, from, to } = d;
    rows.forEach((r) => { r.style.transform = ""; r.classList.remove("drag", "shift"); });
    d = null;
    onDrop(from, to);
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
  box.addEventListener("lostpointercapture", end);
}
