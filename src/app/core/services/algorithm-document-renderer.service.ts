import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { renderToString } from 'katex';
import { marked } from 'marked';

const codeToken = (index: number) => `SWCODESEGMENT${index}TOKEN`;
const mathToken = (index: number) => `SWMATHSEGMENT${index}TOKEN`;

export function renderAlgorithmDocumentHtml(markdown: string): string {
  const codeSegments: string[] = [];
  const mathSegments: string[] = [];
  let source = markdown.replace(/```[\s\S]*?```|`[^`\n]*`/g, (segment) => {
    const token = codeToken(codeSegments.length);
    codeSegments.push(segment);
    return token;
  });
  source = source.replace(/\b(?:javascript|vbscript):/gi, '');
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
