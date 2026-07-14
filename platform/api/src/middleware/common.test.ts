import { describe, expect, it } from 'vitest';
import { toCsv } from './common.js';

describe('toCsv — RFC-4180 formatting', () => {
  it('quotes every field and joins with CRLF', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('"a","b"\r\n"1","2"');
  });

  it('doubles embedded quotes', () => {
    expect(toCsv(['h'], [['she said "hi"']])).toBe('"h"\r\n"she said ""hi"""');
  });

  it('renders null/undefined/number cells safely', () => {
    expect(toCsv(['h'], [[null, undefined, 3]])).toBe('"h"\r\n"","","3"');
  });
});

describe('toCsv — formula-injection hardening (OWASP CSV Injection)', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'neutralizes cells beginning with %j by prefixing a quote',
    (lead) => {
      const payload = `${lead}HYPERLINK("http://evil","x")`;
      const out = toCsv(['name'], [[payload]]);
      // The dangerous value is present but prefixed with ' so a spreadsheet
      // treats it as literal text, not a formula.
      expect(out).toContain(`"'${payload.replace(/"/g, '""')}"`);
    }
  );

  it('leaves ordinary values untouched (no spurious quote prefix)', () => {
    expect(toCsv(['name'], [['Aisyah binti Rahman']])).toBe('"name"\r\n"Aisyah binti Rahman"');
    expect(toCsv(['mc'], [['MC-2026-000001']])).toBe('"mc"\r\n"MC-2026-000001"');
  });

  it('neutralizes a classic command-injection formula payload', () => {
    const out = toCsv(['x'], [['=cmd|\'/c calc\'!A1']]);
    expect(out.startsWith('"x"\r\n"\'=cmd')).toBe(true);
  });
});
