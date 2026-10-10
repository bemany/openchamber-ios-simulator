export const BASE_CSS = `
*{box-sizing:border-box}
[data-oc-theme="dark"]{color-scheme:dark}
[data-oc-theme="light"]{color-scheme:light}
html,body{margin:0;color:var(--oc-fg);font:12px/1.4 var(--oc-font);background:transparent}
[hidden]{display:none!important}
.muted{color:var(--oc-muted)}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--oc-muted);flex:none}
.dot.on{background:var(--oc-success-text)}
.dot.busy{background:var(--oc-warning-text)}
.dot.error{background:var(--oc-error-text)}
`;

export const installStyle = (css: string): void => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
};

export const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Small stroke icons on a 24 grid, so the toolbar fits narrow panels. */
const ICONS = {
  power: ['M12 3v8', 'M6.3 6.8a8 8 0 1 0 11.4 0'],
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-5h4v5'],
  rotate: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4v5h-5'],
  contrast: ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', 'M12 4v16'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  frame: ['M8 2.5h8a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 19V5A2.5 2.5 0 0 1 8 2.5z', 'M10.5 5.5h3'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
} as const;

export type IconName = keyof typeof ICONS;

export const icon = (name: IconName, fillHalf = false): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  if (fillHalf) {
    const half = document.createElementNS(SVG_NS, 'path');
    half.setAttribute('d', 'M12 4a8 8 0 0 1 0 16z');
    half.setAttribute('fill', 'currentColor');
    svg.append(half);
  }
  return svg;
};
