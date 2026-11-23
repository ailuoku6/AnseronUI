/** Development-only DOM capture. Styles and same-origin image bytes are embedded
 * before rasterizing so the result describes the rendered page, including scroll. */
export async function captureDOM(root: HTMLElement, id: number, sample = 1) {
  const target = id > 0 ? root.querySelector<HTMLElement>(`[data-tsn-node="${id}"]`) : root;
  if (!target) throw new Error('UNKNOWN_NODE');
  const bounds = target.getBoundingClientRect(), page = root.getBoundingClientRect();
  if (!bounds.width || !bounds.height) throw new Error('EMPTY_CAPTURE');
  const clone = target.cloneNode(true) as HTMLElement;
  const originals = [target, ...target.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  for (let i = 0; i < originals.length; i++) {
    const from = originals[i], to = copies[i], style = getComputedStyle(from);
    to.style.cssText = Array.from(style).map(key => `${key}:${style.getPropertyValue(key)};`).join('');
    to.style.animation = 'none'; to.style.transition = 'none';
    if (from instanceof HTMLInputElement) to.setAttribute('value', from.type === 'password' ? '•'.repeat(from.value.length) : from.value);
    if (from instanceof HTMLTextAreaElement) to.textContent = from.value;
    if (from instanceof HTMLCanvasElement) throw new Error('CANVAS_CAPTURE_UNSUPPORTED');
    if (from instanceof HTMLImageElement && to instanceof HTMLImageElement && from.currentSrc) {
      const response = await fetch(from.currentSrc);
      if (!response.ok) throw new Error('IMAGE_CAPTURE_FAILED');
      const blob = await response.blob();
      to.src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
      to.removeAttribute('srcset');
    }
    // ForeignObject has no live scroll state. Move the cloned content to the
    // viewport offset and retain overflow clipping in its parent.
    if (from.scrollTop || from.scrollLeft) {
      const wrapper = document.createElement('div');
      wrapper.style.transform = `translate(${-from.scrollLeft}px, ${-from.scrollTop}px)`;
      wrapper.append(...to.childNodes); to.append(wrapper);
    }
  }
  clone.style.position = 'relative'; clone.style.left = '0'; clone.style.top = '0'; clone.style.margin = '0'; clone.style.transform = 'none';
  const width = bounds.width, height = bounds.height;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('DOM_CAPTURE_FAILED')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const scale = Math.min(devicePixelRatio / sample, 2048 / width, 2048 / height);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {data:canvas.toDataURL('image/png'), ox:bounds.left-page.left, oy:bounds.top-page.top, ow:width, oh:height};
}
