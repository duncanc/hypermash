
const identEscapePattern = /\\(?:[^\r\n\f0-9a-fA-F]|[0-9a-fA-F]{1,6}(?:[ \t\n\f]|\r\n?)?)/ug;

const stringEscapePattern = new RegExp(
  identEscapePattern.source.replace(/\)$/, '|' + /[\n\f]|\r\n?/.source + ')'),
  'ug'
);

const identHeadCharPattern = new RegExp(
  '(?:' + /[a-zA-Z_\u0080-\uFFFF]/.source + '|' + identEscapePattern.source + ')'
);

const identTailCharPattern = new RegExp(
  '(?:' + /[a-zA-Z0-9_\-\u0080-\uFFFF]/.source + '|' + identEscapePattern.source + ')'
);

const identPattern = new RegExp(
  '(?:--|-?' + identHeadCharPattern.source + ')' + identTailCharPattern.source + '*'
);

const MIDX_URL = 1;
const MIDX_IDENT_CALL = 2;
const MIDX_NUMBER_UNIT = 3;

const tokenPattern = new RegExp([
  /\/\*(?:[^]*?\*\/)?/.source,
  /[ \t\r\n\f]+/.source,
  // match[1]: url() token
  /[uU][rR][lL]\([ \t\r\n\f]*([^"'()\\ \t\r\n\f\x00-\x08\x0E-\x1F\x7F]+)[ \t\r\n\f]*\)/.source,
  // match[2]: ident-is-call token
  identPattern.source + '([(])?',
  '@' + identPattern.source,
  '#' + identTailCharPattern.source + '+',
  '"(?:' + /[^"\\\n\r\f]/.source + '+|' + stringEscapePattern.source + ')*"',
  "'(?:" + /[^'\\\n\r\f]/.source + '+|' + stringEscapePattern.source + ")*'",
  // match[3]: number-unit token
  /[+\-]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]+)?)(?:[eE][+\-]?[0-9]+)?/.source + '(%|' + identPattern.source + ')?',
  /[^]/.source, // any single character not already matched
].join('|'), 'gyu');

type ContentToken = {
  type: 'comment' | 'whitespace' | 'string' | 'identifier' | 'at-identifier' | 'hash' | 'symbol' | 'call-open' | 'url';
  content: string;
};

type NumericToken = {
  type: 'number';
  value: number;
  unit?: string;
};

export type FlatToken = ContentToken | NumericToken;

const escapeReplace = (str: string) => {
  const hexMatch = str.match(/^\\([0-9a-fA-F]+)/);
  if (hexMatch) {
    const hex = parseInt(hexMatch[1], 16);
    if (hex > 0x10ffff) {
      throw new SyntaxError('Unicode escape out of range');
    }
    return String.fromCodePoint(hex);
  }
  return str.slice(1);
};

export function *eachToken(text: string): Generator<FlatToken> {
  const rx = new RegExp(tokenPattern);
  for (let m = rx.exec(text); m; m = rx.exec(text)) {
    switch (m[0][0]) {
      case ' ': case '\t': case '\r': case '\n': case '\f': {
        yield {type:'whitespace', content:m[0]};
        continue;
      }
      case '/': {
        if (m[0][1] === '*') {
          if (m.length === 2) {
            throw new SyntaxError('unterminated comment');
          }
          yield {type:'comment', content:m[0].slice(2, -2)};
        }
        else {
          yield {type:'symbol', content:m[0]};
        }
        continue;
      }
      case '"': case "'": {
        if (m[0].length === 1) {
          throw new SyntaxError('unterminated string');
        }
        const content = m[0].slice(1, -1).replace(stringEscapePattern, escapeReplace);
        yield {type:'string', content};
        continue;
      }
      case '#': {
        if (m[0].length === 1) {
          yield {type:'symbol', content:'#'};
        }
        else {
          yield {type:'hash', content:m[0].slice(1).replace(identEscapePattern, escapeReplace)};
        }
        continue;
      }
      case '@': {
        if (m[0].length === 1) {
          yield {type:'symbol', content:'@'};
        }
        else {
          yield {type:'at-identifier', content:m[0].slice(1).replace(identEscapePattern, escapeReplace)};
        }
        continue;
      }
      case '-': {
        if (m[0].length === 1) {
          yield {type:'symbol', content:'-'};
        }
        else if (m[0][1] === '.' || (m[0][1] >= '0' && m[0][1] <= '9')) {
          const unit = m[MIDX_NUMBER_UNIT];
          if (unit) {
            yield {
              type: 'number',
              value: Number(m[0].slice(0, -unit.length)),
              unit: unit.replace(identEscapePattern, escapeReplace),
            };
          }
          else {
            yield {type:'number', value:Number(m[0])};
          }
        }
        else {
          if (m[MIDX_IDENT_CALL]) {
            yield {type:'call-open', content:m[0].slice(0, -1).replace(identEscapePattern, escapeReplace)};
          }
          else {
            yield {type:'identifier', content:m[0].replace(identEscapePattern, escapeReplace)};
          }
        }
        continue;
      }
      case '+': {
        if (m[0].length === 1) {
          yield {type:'symbol', content:'+'};
        }
        else {
          const unit = m[MIDX_NUMBER_UNIT];
          if (unit) {
            yield {
              type: 'number',
              value: Number(m[0].slice(0, -unit.length)),
              unit: unit.replace(identEscapePattern, escapeReplace),
            };
          }
          else {
            yield {type:'number', value:Number(m[0])};
          }
        }
        continue;
      }
      case '.':
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9': {
        if (m[0] === '.') {
          yield {type:'symbol', content:'.'};
        }
        else {
          const unit = m[MIDX_NUMBER_UNIT];
          if (unit) {
            yield {
              type: 'number',
              value: Number(m[0].slice(0, -unit.length)),
              unit: unit.replace(identEscapePattern, escapeReplace),
            };
          }
          else {
            yield {type:'number', value:Number(m[0])};
          }
        }
        continue;
      }
      case '\\': {
        if (m.length === 1) {
          throw new SyntaxError('invalid escape');
        }
        break;
      }
    }
    if (/^[!#$%&()*+,\-\.\/:;<=>?@\[\]\^`{|}~]$/.test(m[0])) {
      yield {type:'symbol', content:m[0]};
    }
    else if (m[MIDX_URL]) {
      yield {type:'url', content:m[MIDX_URL]};
    }
    else if (m[MIDX_IDENT_CALL]) {
      yield {type:'call-open', content:m[0].slice(0,-1).replace(identEscapePattern, escapeReplace)};
    }
    else {
      yield {type:'identifier', content:m[0].replace(identEscapePattern, escapeReplace)};
    }
  }
}
