// 表單小工具：滑桿 + 數字框、開關、下拉，並雙向綁定到物件路徑
import { esc } from './util.js';

export const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
export function setPath(o, p, v) {
  const ks = p.split('.'), last = ks.pop();
  ks.reduce((x, k) => x[k], o)[last] = v;
}

export const slider = (label, bind, min, max, step, hint = '') => `
  <div class="fld slider" ${hint ? `data-hint="${esc(hint)}"` : ''}>
    <span>${label}</span>
    <div class="slider-row"><input type="range" min="${min}" max="${max}" step="${step}" data-bind="${bind}"><input class="num" type="number" min="${min}" max="${max}" step="${step}" data-bind="${bind}"></div>
  </div>`;

/** 滑桿 + 直接顯示在下方的小解說 */
export const sliderNote = (label, bind, min, max, step, note) => `
  <div class="fld slider" data-hint="${esc(note)}">
    <span>${label}</span>
    <div class="slider-row"><input type="range" min="${min}" max="${max}" step="${step}" data-bind="${bind}"><input class="num" type="number" min="${min}" max="${max}" step="${step}" data-bind="${bind}"></div>
    <small class="fld-note">${note}</small>
  </div>`;

export const toggle = (label, bind, hint = '') => `
  <label class="fld toggle" ${hint ? `data-hint="${esc(hint)}"` : ''}><input type="checkbox" data-bind="${bind}"><i class="sw"></i><span>${label}</span></label>`;

export const select = (label, bind, options, hint = '') => `
  <label class="fld" ${hint ? `data-hint="${esc(hint)}"` : ''}><span>${label}</span>
    <select class="field" data-bind="${bind}">${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;

export const text = (label, bind, { area = false, rows = 3, placeholder = '', hint = '', max = '' } = {}) => `
  <label class="fld" ${hint ? `data-hint="${esc(hint)}"` : ''}><span>${label}</span>
    ${area ? `<textarea class="field" rows="${rows}" data-bind="${bind}" placeholder="${esc(placeholder)}"></textarea>`
      : `<input class="field" data-bind="${bind}" placeholder="${esc(placeholder)}" ${max ? `maxlength="${max}"` : ''}>`}</label>`;

/** 把 root 底下所有 [data-bind] 綁到 ctx；改動後呼叫 onChange(path, value) */
export function bindAll(root, ctx, onChange) {
  const inputs = [...root.querySelectorAll('[data-bind]')];
  const sync = path => inputs.filter(i => i.dataset.bind === path).forEach(i => {
    const v = getPath(ctx, path);
    if (i.type === 'checkbox') i.checked = !!v;
    else if (document.activeElement !== i) i.value = v ?? '';
  });
  inputs.forEach(i => {
    sync(i.dataset.bind);
    const ev = i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input';
    i.addEventListener(ev, () => {
      const path = i.dataset.bind;
      let v = i.type === 'checkbox' ? i.checked : i.value;
      if (i.type === 'range' || i.type === 'number') { v = parseFloat(v); if (Number.isNaN(v)) return; }
      setPath(ctx, path, v);
      inputs.filter(o => o !== i && o.dataset.bind === path).forEach(o => { if (o.type === 'checkbox') o.checked = !!v; else o.value = v; });
      onChange?.(path, v, i);
    });
  });
  return { refresh: () => [...new Set(inputs.map(i => i.dataset.bind))].forEach(sync) };
}

/** 滑鼠停在有 data-hint 的設定上時，在 hintEl 顯示說明 */
export function hints(root, hintEl) {
  const def = hintEl.textContent;
  root.addEventListener('pointerover', e => {
    const f = e.target.closest('[data-hint]');
    hintEl.textContent = f ? f.dataset.hint : def;
    hintEl.classList.toggle('on', !!f);
  });
  root.addEventListener('pointerleave', () => { hintEl.textContent = def; hintEl.classList.remove('on'); });
}
