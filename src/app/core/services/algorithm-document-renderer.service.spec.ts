import { describe, expect, it } from 'vitest';

import { renderAlgorithmDocumentHtml } from './algorithm-document-renderer.service';

describe('algorithm document renderer', () => {
  it('renders display and inline formulas with KaTeX', () => {
    const html = renderAlgorithmDocumentHtml('量化损失 $L_q$：\n\n$$L_q = q\\max(y-\\hat y, 0)$$');

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
  });

  it('preserves code and safe documentation images', () => {
    const html1 = renderAlgorithmDocumentHtml(
      '`cost = "$5"`\n\n![架构图](/assets/docs/chronos2-architecture.svg)',
    );
    expect(html1).toContain('<code>cost = "$5"</code>');
    expect(html1).toContain('data:image/svg+xml;utf8');
    expect(html1).toContain('alt="架构图"');

    const html2 = renderAlgorithmDocumentHtml(
      '![架构图](../../static/api/v1/document-assets/chronos2-architecture.svg)',
    );
    expect(html2).toContain('data:image/svg+xml;utf8');
    expect(html2).toContain('alt="架构图"');
  });

  it('removes executable html and unsafe urls', () => {
    const html = renderAlgorithmDocumentHtml(
      '<script>alert(1)</script><img src="x" onerror="alert(2)">[bad](javascript:alert(3))',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });
});
