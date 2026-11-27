/**
 * Safe and lightweight Markdown parser for assistant responses.
 * Escapes raw HTML first to prevent any XSS attacks,
 * then formats standard markdown constructs (code blocks, bold, lists, links, etc.).
 */

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseMarkdown(text) {
  if (!text) return '';

  // Filter out action code blocks from standard markdown formatting
  const textWithoutAction = text.replace(/```(?:action:[a-zA-Z0-9_-]+|action)\s*\n[\s\S]*?\n```/gi, '').trim();

  // Step 1: Escape all raw HTML
  let md = escapeHtml(textWithoutAction);

  // Step 2: Code blocks with copy button
  md = md.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<div class="code-block-wrapper">
      <div class="code-header">
        ${langLabel}
        <button class="copy-code-btn" type="button" aria-label="Copy code block">Copy</button>
      </div>
      <pre><code>${code.trim()}</code></pre>
    </div>`;
  });

  // Step 3: Inline code
  md = md.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // Step 4: Headers
  md = md.replace(/^### (.*$)/gim, '<h4>$1</h4>');
  md = md.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  md = md.replace(/^# (.*$)/gim, '<h2>$1</h2>');

  // Step 5: Bold and Italic
  // Emphasis stays on one line, and underscores inside words (full_time, job_id) are left alone.
  md = md.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  md = md.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/gm, '$1<em>$2</em>');
  md = md.replace(/(^|[^\w])__(?!\s)([^_\n]+?)__(?!\w)/gm, '$1<strong>$2</strong>');
  md = md.replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/gm, '$1<em>$2</em>');

  // Step 6: Blockquotes
  md = md.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Step 7: Unordered lists
  md = md.replace(/^\s*[-*+]\s+(.*)$/gim, '<li>$1</li>');
  // Wrap each run of consecutive items in its own list, so a heading between two lists
  // (e.g. "### 2. Next job") is not swallowed into the list above it.
  md = md.replace(/(?:^<li>.*<\/li>$\n?)+/gm, (match) => {
    const trailing = match.endsWith('\n') ? '\n' : '';
    return `<ul>${match.replace(/\n/g, '')}</ul>${trailing}`;
  });
  // Clean up nested adjacent uls
  md = md.replace(/<\/ul>\s*<ul>/g, '');
  // A list is its own block (never inside a <p> after a line break).
  md = md.replace(/\n?(<ul>.*?<\/ul>)\n?/g, '\n\n$1\n\n');

  // Step 8: Links (sanitized with target and rel)
  md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Step 9: Paragraphs and line breaks
  // Convert double newlines to paragraph breaks
  const paragraphs = md.split(/\n{2,}/);
  const formatted = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    // Don't wrap in <p> if it starts with block element
    if (/^<(h[1-4]|div|pre|ul|ol|blockquote)/i.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
  }).filter(Boolean).join('');

  return formatted;
}
