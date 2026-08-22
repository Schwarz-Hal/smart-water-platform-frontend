import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { renderToString } from 'katex';
import { marked } from 'marked';

const codeToken = (index: number) => `SWCODESEGMENT${index}TOKEN`;
const mathToken = (index: number) => `SWMATHSEGMENT${index}TOKEN`;

export const CHRONOS2_ARCHITECTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 500" role="img" aria-labelledby="title desc">
  <title id="title">Chronos-2 核心预测架构</title>
  <desc id="desc">输入时序经过稳健缩放、元特征、分块嵌入、时间注意力和组注意力，最后由分位数预测头输出多个分位数。</desc>
  <defs>
    <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6faff"/>
      <stop offset="1" stop-color="#edf7f8"/>
    </linearGradient>
    <linearGradient id="transformer" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e9efff"/>
      <stop offset="1" stop-color="#e8fbf8"/>
    </linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#3976a8"/>
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#17324d" flood-opacity="0.12"/>
    </filter>
    <style>
      .title { font: 700 25px Inter, "Microsoft YaHei", sans-serif; fill: #17324d; }
      .box-title { font: 700 17px Inter, "Microsoft YaHei", sans-serif; fill: #17324d; }
      .copy { font: 13px Inter, "Microsoft YaHei", sans-serif; fill: #536b82; }
      .small { font: 12px Inter, "Microsoft YaHei", sans-serif; fill: #6c8297; }
      .arrow { fill: none; stroke: #3976a8; stroke-width: 3; marker-end: url(#arrow); }
      .box { stroke-width: 1.5; filter: url(#shadow); }
    </style>
  </defs>

  <rect width="1200" height="500" rx="24" fill="url(#canvas)"/>
  <text x="40" y="48" class="title">Chronos-2：从时序输入到概率预测</text>

  <g transform="translate(40 108)">
    <rect class="box" width="160" height="190" rx="16" fill="#ffffff" stroke="#a9c4dc"/>
    <text x="80" y="34" text-anchor="middle" class="box-title">输入时序</text>
    <path d="M24 92 C44 54, 57 125, 79 84 S119 55, 137 103" fill="none" stroke="#1886b3" stroke-width="4"/>
    <path d="M24 125 C45 103, 60 152, 82 120 S118 102, 138 132" fill="none" stroke="#55a89b" stroke-width="3" opacity="0.8"/>
    <text x="80" y="160" text-anchor="middle" class="copy">目标 · 协变量</text>
    <text x="80" y="179" text-anchor="middle" class="small">历史与未来已知值</text>
  </g>

  <path class="arrow" d="M208 203 H254"/>

  <g transform="translate(266 108)">
    <rect class="box" width="180" height="190" rx="16" fill="#ffffff" stroke="#9ec9c1"/>
    <text x="90" y="34" text-anchor="middle" class="box-title">缩放与元特征</text>
    <rect x="25" y="58" width="130" height="34" rx="9" fill="#e9f8f5"/>
    <text x="90" y="80" text-anchor="middle" class="copy">asinh 稳健缩放</text>
    <rect x="25" y="103" width="130" height="34" rx="9" fill="#eef5ff"/>
    <text x="90" y="125" text-anchor="middle" class="copy">相对时间索引</text>
    <rect x="25" y="148" width="130" height="24" rx="8" fill="#f2efff"/>
    <text x="90" y="165" text-anchor="middle" class="small">观测掩码</text>
  </g>

  <path class="arrow" d="M454 203 H500"/>

  <g transform="translate(512 108)">
    <rect class="box" width="160" height="190" rx="16" fill="#ffffff" stroke="#b7b2df"/>
    <text x="80" y="34" text-anchor="middle" class="box-title">分块嵌入</text>
    <g transform="translate(25 62)">
      <rect width="30" height="58" rx="6" fill="#d9e6ff"/>
      <rect x="39" width="30" height="58" rx="6" fill="#cdddf9"/>
      <rect x="78" width="30" height="58" rx="6" fill="#bdcfef"/>
      <text x="54" y="82" text-anchor="middle" class="small">非重叠 patch</text>
    </g>
    <rect x="25" y="154" width="110" height="24" rx="8" fill="#f1effb"/>
    <text x="80" y="171" text-anchor="middle" class="small">残差嵌入网络</text>
  </g>

  <path class="arrow" d="M680 203 H726"/>

  <g transform="translate(738 78)">
    <rect class="box" width="250" height="250" rx="18" fill="url(#transformer)" stroke="#7ea6cc"/>
    <text x="125" y="34" text-anchor="middle" class="box-title">Encoder-only Transformer</text>
    <g transform="translate(25 55)">
      <rect width="200" height="56" rx="12" fill="#ffffff" stroke="#8fb7dc"/>
      <text x="100" y="25" text-anchor="middle" class="box-title">时间注意力</text>
      <text x="100" y="44" text-anchor="middle" class="small">同一序列内跨时间 patch</text>
    </g>
    <path d="M125 116 V137" stroke="#568ab6" stroke-width="2.5" marker-end="url(#arrow)"/>
    <g transform="translate(25 143)">
      <rect width="200" height="56" rx="12" fill="#ffffff" stroke="#72b9aa"/>
      <text x="100" y="25" text-anchor="middle" class="box-title">组注意力</text>
      <text x="100" y="44" text-anchor="middle" class="small">相关目标与协变量间共享信息</text>
    </g>
    <text x="125" y="228" text-anchor="middle" class="copy">交替堆叠 × N</text>
  </g>

  <path class="arrow" d="M996 203 H1042"/>

  <g transform="translate(1054 108)">
    <rect class="box" width="106" height="190" rx="16" fill="#ffffff" stroke="#b3a5dc"/>
    <text x="53" y="34" text-anchor="middle" class="box-title">分位数头</text>
    <rect x="18" y="62" width="70" height="28" rx="14" fill="#dff3ee"/>
    <text x="53" y="81" text-anchor="middle" class="copy">P10</text>
    <rect x="18" y="101" width="70" height="28" rx="14" fill="#dceaff"/>
    <text x="53" y="120" text-anchor="middle" class="copy">P50</text>
    <rect x="18" y="140" width="70" height="28" rx="14" fill="#eee5ff"/>
    <text x="53" y="159" text-anchor="middle" class="copy">P90</text>
  </g>

  <g transform="translate(40 366)">
    <rect width="1120" height="82" rx="14" fill="#ffffff" stroke="#d7e1ec"/>
    <text x="24" y="29" class="box-title">关键机制</text>
    <text x="24" y="56" class="copy">直接多步预测 · 概率分位数输出 · 组内上下文学习 · 单变量 / 多变量 / 协变量统一建模</text>
    <text x="1094" y="62" text-anchor="end" class="small">依据 Ansari et al. (2025), Figure 1 重绘</text>
  </g>
</svg>`;

const CHRONOS2_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(CHRONOS2_ARCHITECTURE_SVG)}`;

export const BUILTIN_DOCUMENT_ASSETS: Record<string, string> = {
  'chronos2-architecture.svg': CHRONOS2_DATA_URI,
  '/assets/docs/chronos2-architecture.svg': CHRONOS2_DATA_URI,
  'assets/docs/chronos2-architecture.svg': CHRONOS2_DATA_URI,
};

export function renderAlgorithmDocumentHtml(markdown: string): string {
  const codeSegments: string[] = [];
  const mathSegments: string[] = [];
  let source = markdown.replace(/```[\s\S]*?```|`[^`\n]*`/g, (segment) => {
    const token = codeToken(codeSegments.length);
    codeSegments.push(segment);
    return token;
  });
  source = source.replace(/\b(?:javascript|vbscript):/gi, '');
  for (const [filename, dataUri] of Object.entries(BUILTIN_DOCUMENT_ASSETS)) {
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mdRegex = new RegExp(`!\\[(.*?)\\]\\([^\\)]*?${escaped}[^\\)]*?\\)`, 'gi');
    source = source.replace(mdRegex, `![$1](${dataUri})`);
    const imgRegex = new RegExp(`<img([^>]*?)src=["'][^"']*?${escaped}[^"']*?["']([^>]*?)>`, 'gi');
    source = source.replace(imgRegex, `<img$1src="${dataUri}"$2>`);
  }
  source = source.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expression: string) => {
    const token = mathToken(mathSegments.length);
    mathSegments.push(
      renderToString(expression.trim(), {
        displayMode: true,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'htmlAndMathml',
      }),
    );
    return token;
  });
  source = source.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_match, expression: string) => {
    const token = mathToken(mathSegments.length);
    mathSegments.push(
      renderToString(expression.trim(), {
        displayMode: false,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'htmlAndMathml',
      }),
    );
    return token;
  });
  codeSegments.forEach((segment, index) => {
    source = source.replaceAll(codeToken(index), segment);
  });
  let html = marked.parse(source, { async: false, gfm: true }) as string;
  mathSegments.forEach((segment, index) => {
    html = html.replaceAll(mathToken(index), segment);
  });
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  });
}

@Injectable({ providedIn: 'root' })
export class AlgorithmDocumentRendererService {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cache = new Map<string, SafeHtml>();

  render(markdown: string): SafeHtml {
    const cached = this.cache.get(markdown);
    if (cached) return cached;
    const value = this.sanitizer.bypassSecurityTrustHtml(renderAlgorithmDocumentHtml(markdown));
    this.cache.set(markdown, value);
    return value;
  }
}
