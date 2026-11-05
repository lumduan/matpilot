'use client';

/** Read-only Python with line numbers; the line of a compile error is marked. */
export function CodeView({
  code,
  errorLine,
  label = 'Python made from the blocks',
}: {
  code: string;
  errorLine: number | null;
  label?: string;
}) {
  const lines = code === '' ? [''] : code.replace(/\n$/, '').split('\n');
  return (
    <div className="code-view" data-testid="python-code">
      <pre className="code-gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <span key={i} className={i + 1 === errorLine ? 'code-gutter-error' : undefined}>
            {i + 1}
            {'\n'}
          </span>
        ))}
      </pre>
      <pre className="code-text" tabIndex={0} aria-label={label}>
        {code}
      </pre>
    </div>
  );
}
