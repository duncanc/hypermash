
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
  /(?:\\?[uU]|\\0{0,4}[57]5(?:[ \t\n\f]|\r\n?)?)(?:\\?[rR]|\\0{0,4}[57]2(?:[ \t\n\f]|\r\n?)?)(?:\\?[lL]|\\0{0,4}[46][cC](?:[ \t\n\f]|\r\n?)?)\([ \t\r\n\f]*([^"'()\\ \t\r\n\f\x00-\x08\x0E-\x1F\x7F]+)[ \t\r\n\f]*\)/.source,
  /[uU]\+[0-9a-fA-F?]{1,6}(?:-[0-9a-fA-F]{1,6})?/.source,
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

export namespace Token {

  export type Content = {
    type: (
      | 'comment'
      | 'whitespace'
      | 'string'
      | 'identifier'
      | 'at-identifier'
      | 'hash'
      | 'symbol'
      | 'call-open'
      | 'url'
    );
    content: string;
  };

  export type Numeric = {
    type: 'number';
    value: number;
    unit?: string;
  };

  export type UnicodeRange = {
    type: 'unicode-range';
    fromCodePoint: number;
    toCodePoint: number;
  };

};

export type Token = (
  | Token.Content
  | Token.Numeric
  | Token.UnicodeRange
);

const escapeReplace = (str: string) => {
  const hexMatch = str.match(/^\\([0-9a-fA-F]+)/);
  if (hexMatch) {
    const hex = parseInt(hexMatch[1], 16);
    if (hex > 0x10ffff) {
      throw new SyntaxError('Unicode escape out of range');
    }
    return String.fromCodePoint(hex);
  }
  if (/^\\[\r\n\f]/.test(str)) {
    // escaped newlines are omitted, not preserved
    return '';
  }
  return str.slice(1);
};

export function *eachToken(text: string): Generator<Token> {
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
      case 'u': case 'U': {
        if (m[0][1] === '+') {
          const parts = m[0].slice(2).split('-');
          if (parts.length === 2) {
            if (parts[0].indexOf('?') !== -1) {
              throw new SyntaxError('invalid unicode range');
            }
            const fromCodePoint = parseInt(parts[0], 16);
            if (fromCodePoint > 0x10ffff) {
              throw new SyntaxError('unicode codepoint out of range');
            }
            const toCodePoint = parseInt(parts[1], 16);
            if (toCodePoint > 0x10ffff) {
              throw new SyntaxError('unicode codepoint out of range');
            }
            if (toCodePoint < fromCodePoint) {
              throw new SyntaxError('invalid unicode codepoint range');
            }
            yield {
              type: 'unicode-range',
              fromCodePoint,
              toCodePoint,
            };
          }
          else {
            const parts2 = parts[0].match(/^([^\?]*)(\?*)$/);
            if (!parts2) {
              throw new SyntaxError('invalid unicode codepoint range');
            }
            if (parts2[2].length === 0) {
              const codePoint = parseInt(parts2[1], 16);
              if (codePoint > 0x10ffff) {
                throw new SyntaxError('unicode codepoint out of range');
              }
              yield {
                type: 'unicode-range',
                fromCodePoint: codePoint,
                toCodePoint: codePoint,
              };
            }
            else {
              const fromCodePoint = parseInt(parts[0].replace(/\?/g, '0'), 16);
              const toCodePoint = parseInt(parts[0].replace(/\?+$/, v => '10ffff'.slice(-v.length)), 16);
              yield {
                type: 'unicode-range',
                fromCodePoint,
                toCodePoint,
              };
            }
          }
          continue;
        }
        break;
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

export namespace Unit {

  export type Literal = {
    type: 'comment' | 'whitespace' | 'string' | 'identifier' | 'at-identifier' | 'hash' | 'symbol';
    content: string;
  };

  export type Numeric = {
    type: 'number';
    value: number;
    unit?: string;
  };

  export type UnicodeRange = {
    type: 'unicode-range';
    fromCodePoint: number;
    toCodePoint: number;
  };

  export type Container = {
    type: 'curly' | 'square' | 'round';
    content: Unit[];
  };

  export type Call = {
    type: 'call';
    funcName: string;
    params: Unit[];
  }

};

export type Unit = (
  | Unit.Literal
  | Unit.Container
  | Unit.Call
  | Unit.Numeric
  | Unit.UnicodeRange
);

export function toUnits(
  src: string | Iterable<Token> | Iterator<Token>,
  {
    ignoreWhitespace = false,
    ignoreComments = false,
  }: {
    ignoreWhitespace?: boolean;
    ignoreComments?: boolean;
  } = {},
): Unit[] {
  if (typeof src === 'string') {
    src = eachToken(src);
  }
  const iter = (Symbol.iterator in src) ? src[Symbol.iterator]() : src;
  const contextStack: Unit[][] = [];
  const topLevel: Unit[] = [];
  let context = topLevel;
  for (let step = iter.next(); !step.done; step = iter.next()) {
    const token = step.value;
    switch (token.type) {
      case 'call-open': {
        const newCall: Unit.Call = {
          type: 'call',
          funcName: token.content,
          params: [],
        };
        context.push(newCall);
        contextStack.push(context);
        context = newCall.params;
        break;
      }
      case 'symbol': {
        switch (token.content) {
          case '(': {
            const newBlock: Unit.Container = {
              type: 'round',
              content: [],
            };
            context.push(newBlock);
            contextStack.push(context);
            context = newBlock.content;
            break;
          }
          case ')': {
            if (contextStack.length === 0) {
              throw new SyntaxError('mismatched parentheses');
            }
            context = contextStack.pop()!;
            if (context[context.length-1].type !== 'round' && context[context.length-1].type !== 'call') {
              throw new SyntaxError('mismatched parentheses');
            }
            break;
          }
          case '[': {
            const newBlock: Unit.Container = {
              type: 'square',
              content: [],
            };
            context.push(newBlock);
            contextStack.push(context);
            context = newBlock.content;
            break;
          }
          case ']': {
            if (contextStack.length === 0) {
              throw new SyntaxError('mismatched parentheses');
            }
            context = contextStack.pop()!;
            if (context[context.length-1].type !== 'square') {
              throw new SyntaxError('mismatched parentheses');
            }
            break;
          }
          case '{': {
            const newBlock: Unit.Container = {
              type: 'curly',
              content: [],
            };
            context.push(newBlock);
            contextStack.push(context);
            context = newBlock.content;
            break;
          }
          case '}': {
            if (contextStack.length === 0) {
              throw new SyntaxError('mismatched parentheses');
            }
            context = contextStack.pop()!;
            if (context[context.length-1].type !== 'curly') {
              throw new SyntaxError('mismatched parentheses');
            }
            break;
          }
          default: {
            context.push(token as Unit.Literal);
            break;
          }
        }
        break;
      }
      case 'url': {
        context.push({
          type: 'call',
          funcName: 'url',
          params: [
            {
              type: 'string',
              content: token.content,
            },
          ],
        });
        break;
      }
      case 'whitespace': {
        if (ignoreWhitespace) continue;
        context.push(token as Unit.Literal);
        break;
      }
      case 'comment': {
        if (ignoreComments) continue;
        context.push(token as Unit.Literal);
        break;
      }
      case 'number': {
        context.push(token as Unit.Numeric);
        break;
      }
      case 'unicode-range': {
        context.push(token as Unit.UnicodeRange);
        break;
      }
      default: {
        context.push(token as Unit.Literal);
        break;
      }
    }
  }
  if (contextStack.length !== 0) {
    throw new SyntaxError('unbalanced brackets');
  }
  return topLevel;
}

export namespace UnitMatcher {
  export type ZeroWhitespace = {type: 'zero-whitespace'};
  export type NonZeroWhitespace = {type: 'nonzero-whitespace'};
  export type End = {type:'end'};
  export type Any = {type:'any'};
  export type Success = {type:'success'};
  export type Failure = {type:'failure'};
  export type Repeat = {type:'repeat', min:number, max:number, inner:UnitMatcher};
  export type Sequence = {type:'sequence', sequence:UnitMatcher[]};
  export type Alternate = {type:'alternate', options:UnitMatcher[]};
  export type Subset = {type:'subset', set:UnitMatcher[], min: number, max?: number};
  export type Symbol = {type:'symbol', symbol:string};
  export type Identifier = {type:'identifier' | 'hash' | 'at-identifier', match?: string | RegExp};
  export type Call = {type:'call', funcNameMatch: string | RegExp, params: UnitMatcher};
  export type Container = {type: 'round' | 'square' | 'curly', contents: UnitMatcher};
  export type String = { type: 'string'; };
  export type Number = { type: 'number'; unit?: string | Set<string | false> | false; };
  export type UnicodeRange = { type: 'unicode-range' };
  export type Placeholder = { type: 'placeholder', placeholder: string };

  export type CaptureConstant = {type: 'capture-constant', name?: string, constant:unknown};
  export type CaptureContext = {type: 'capture-context', name?: string};
  export type CaptureArray = {type: 'capture-array', name?: string, inner:UnitMatcher};
  export type CaptureObject = {type: 'capture-object', name?: string, inner:UnitMatcher};
  export type CaptureNamed = {type:'capture-named', name: string, inner:UnitMatcher};
  export type CaptureTransform = {
    type: 'capture-transform';
    inner: UnitMatcher;
    name?: string;
    transform: (...captures: unknown[]) => unknown;
  };
  export type CaptureReduce = {
    type: 'capture-reduce';
    inner: UnitMatcher;
    name?: string;
    initialValue: unknown;
    reduce: (prevValue: unknown, capture: unknown) => unknown;
  };
  export type CaptureUnit = {
    type: 'capture-unit';
    inner?: UnitMatcher;
    name?: string;
  };
  export type CaptureContent = {
    type: 'capture-content';
    inner?: UnitMatcher;
    name?: string;
  };
};

export type UnitMatcher = (
  | UnitMatcher.NonZeroWhitespace
  | UnitMatcher.ZeroWhitespace
  | UnitMatcher.End
  | UnitMatcher.Any
  | UnitMatcher.Success
  | UnitMatcher.Failure
  | UnitMatcher.Repeat
  | UnitMatcher.Sequence
  | UnitMatcher.Alternate
  | UnitMatcher.Subset
  | UnitMatcher.Symbol
  | UnitMatcher.Identifier
  | UnitMatcher.Call
  | UnitMatcher.Container
  | UnitMatcher.String
  | UnitMatcher.Number
  | UnitMatcher.UnicodeRange
  | UnitMatcher.Placeholder

  | UnitMatcher.CaptureConstant
  | UnitMatcher.CaptureContext
  | UnitMatcher.CaptureArray
  | UnitMatcher.CaptureObject
  | UnitMatcher.CaptureNamed
  | UnitMatcher.CaptureTransform
  | UnitMatcher.CaptureReduce
  | UnitMatcher.CaptureUnit
  | UnitMatcher.CaptureContent
);

export function matchUnits(
  units: Unit[],
  matcher: UnitMatcher,
  oncapture = (capture: unknown, name?: string) => {},
  start_i = 0,
  context?: unknown,
): number {
  if (matcher.type === 'nonzero-whitespace') {
    if (!units[start_i] || (
      units[start_i].type !== 'whitespace'
      && units[start_i].type !== 'comment'
    )) {
      return -1;
    }
    do {
      start_i++;
    } while (units[start_i] && (
      units[start_i].type === 'whitespace'
      || units[start_i].type === 'comment'
    ));
    return start_i;
  }
  else if (matcher.type === 'zero-whitespace') {
    if (units[start_i] && (
      units[start_i].type === 'whitespace'
      || units[start_i].type === 'comment'
    )) {
      return -1;
    }
    return start_i;
  }
  else {
    while (units[start_i] && (
      units[start_i].type === 'whitespace'
      || units[start_i].type === 'comment'
    )) {
      start_i++;  
    }
  }
  switch (matcher.type) {
    case 'alternate': {
      for (const h of matcher.options) {
        const end_i = matchUnits(units, h, oncapture, start_i, context);
        if (end_i !== -1) return end_i;
      }
      return -1;
    }
    case 'any': {
      return units[start_i] ? start_i + 1 : -1;
    }
    case 'at-identifier': case 'identifier': case 'hash': {
      const unit = units[start_i];
      if (!unit || unit.type !== matcher.type) {
        return -1;
      }
      if (typeof matcher.match === 'string') {
        if (matcher.match !== unit.content) {
          return -1;
        }
      }
      else if (matcher.match instanceof RegExp) {
        if (!matcher.match.test(unit.content)) {
          return -1;
        }
      }
      return start_i + 1;
    }
    case 'success': {
      return start_i;
    }
    case 'failure': {
      return -1;
    }
    case 'placeholder': {
      throw new Error('placeholders must be replaced before matching');
    }
    case 'call': {
      const unit = units[start_i];
      if (!unit || unit.type !== 'call') {
        return -1;
      }
      if (typeof matcher.funcNameMatch === 'string') {
        if (matcher.funcNameMatch !== unit.funcName) {
          return -1;
        }
      }
      else {
        if (!matcher.funcNameMatch.test(unit.funcName)) {
          return -1;
        }
      }
      let end_i = matchUnits(unit.params, matcher.params, oncapture, 0, context);
      if (end_i === -1) {
        return -1;
      }
      return start_i + 1;
    }
    case 'curly': case 'round': case 'square': {
      const unit = units[start_i];
      if (!unit || unit.type !== matcher.type) {
        return -1;
      }
      if (matchUnits(unit.content, matcher.contents, oncapture, 0, context) === -1) {
        return -1;
      }
      return start_i + 1;
    }
    case 'end': {
      if (start_i < units.length) {
        return -1;
      }
      return start_i;
    }
    case 'any': {
      if (start_i >= units.length) {
        return -1;
      }
      return start_i + 1;
    }
    case 'repeat': {
      let count = 0;
      let i = start_i;
      const caps: {cap:unknown, name?:string}[] = [];
      const oncapture2 = (cap: unknown, name?: string) => { caps.push({cap, name}); };
      while (count < matcher.min) {
        const new_i = matchUnits(units, matcher.inner, oncapture2, i, context);
        if (new_i === -1) return -1;
        if (new_i === i) {
          throw new Error('nothing to repeat');
        }
        i = new_i;
        count++;
      }
      for (const { cap, name } of caps) oncapture(cap, name);
      while (count < matcher.max) {
        const new_i = matchUnits(units, matcher.inner, oncapture, i, context);
        if (new_i === -1) return i;
        if (new_i === i) {
          throw new Error('nothing to repeat');
        }
        i = new_i;
        count++;
      }
      return i;
    }
    case 'sequence': {
      let i = start_i;
      const caps: {name?: string, capture: unknown}[] = [];
      for (const h of matcher.sequence) {
        i = matchUnits(units, h, (capture, name) => caps.push({capture, name}), i, context);
        if (i === -1) return -1;
      }
      for (const { capture, name } of caps) {
        oncapture(capture, name);
      }
      return i;
    }
    case 'subset': {
      let i = start_i;
      const set = matcher.set.slice();
      const caps: {name?: string, capture:unknown}[] = [];
      const oncapture2 = (capture: unknown, name?: string) => { caps.push({capture, name }); };
      let item_i: number;
      for (item_i = 0; item_i < matcher.min; item_i++) {
        let new_i: number = -1;
        for (let m_i = 0; m_i < set.length; m_i++) {
          new_i = matchUnits(units, set[m_i], oncapture2, i, context);
          if (new_i !== -1) {
            set.splice(m_i, 1);
            break;
          }
        }
        if (new_i === -1) return -1;
        i = new_i;
      }
      for (const { capture, name } of caps) {
        oncapture(capture, name);
      }
      const max = matcher.max ?? Infinity;
      while (item_i < max) {
        let new_i: number = -1;
        for (let m_i = 0; m_i < set.length; m_i++) {
          new_i = matchUnits(units, set[m_i], oncapture2, i, context);
          if (new_i !== -1) {
            set.splice(m_i, 1);
            break;
          }
        }
        if (new_i === -1) break;
        i = new_i;
        item_i++;
      }
      return i;
    }
    case 'symbol': {
      const unit = units[start_i];
      if (!unit || unit.type !== 'symbol' || unit.content !== matcher.symbol) {
        return -1;
      }
      return start_i + 1;
    }
    case 'capture-context': {
      if (context == null) {
        throw new Error('context value is null or undefined');
      }
      oncapture(context, matcher.name);
      return start_i;
    }
    case 'capture-array': {
      const arr: unknown[] = [];
      const oncapture2 = (v: unknown) => { arr.push(v); };
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i, context);
      if (end_i === -1) {
        return -1;
      }
      oncapture(arr, matcher.name);
      return end_i;
    }
    case 'capture-object': {
      const obj: {[key: string]: unknown} = Object.create(null);
      const oncapture2 = (v: unknown, name?: string) => {
        if (typeof name === 'string') {
          obj[name] = v;
        }
      };
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i, context);
      if (end_i === -1) {
        return -1;
      }
      oncapture(obj, matcher.name);
      return end_i;
    }
    case 'capture-named': {
      const name = matcher.name;
      const oncapture2 = (cap: unknown) => oncapture(cap, name);
      return matchUnits(units, matcher.inner, oncapture2, start_i, context);
    }
    case 'capture-constant': {
      oncapture(matcher.constant, matcher.name);
      return start_i;
    }
    case 'capture-transform': {
      const caps: unknown[] = [];
      const oncapture2 = (cap: unknown) => { caps.push(cap); };
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i, context);
      if (end_i === -1) {
        return -1;
      }
      oncapture(matcher.transform(...caps), matcher.name);
      return end_i;
    }
    case 'capture-reduce': {
      let cap = matcher.initialValue;
      const oncapture2 = (c: unknown) => { cap = matcher.reduce(cap, c); };
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i, context);
      if (end_i === -1) {
        return -1;
      }
      oncapture(cap, matcher.name);
      return end_i;
    }
    case 'capture-unit': {
      if (!matcher.inner) {
        if (!units[start_i]) {
          oncapture(null);
          return start_i;
        }
        oncapture(units[start_i]);
        return start_i + 1;
      }
      const end_i = matchUnits(units, matcher.inner, ()=>{}, start_i, context);
      if (end_i === -1) return -1;
      if (end_i === start_i) {
        oncapture(null);
        return end_i;
      }
      oncapture(units[end_i-1], matcher.name);
      return end_i;
    }
    case 'string': {
      if (!units[start_i] || units[start_i].type !== 'string') {
        return -1;
      }
      return start_i + 1;
    }
    case 'unicode-range': {
      if (!units[start_i] || units[start_i].type !== 'unicode-range') {
        return -1;
      }
      return start_i + 1;
    }
    case 'number': {
      const unit = units[start_i];
      if (!unit || unit.type !== 'number') {
        return -1;
      }
      if (matcher.unit) {
        if (typeof matcher.unit === 'string') {
          if (unit.unit !== matcher.unit) return -1;
        }
        else if (matcher.unit instanceof Set) {
          if (!matcher.unit.has(unit.unit ?? false)) {
            return -1;
          }
        }
        else if (matcher.unit === false) {
          if (matcher.unit != null) {
            return -1;
          }
        }
      }
      else {
        if (unit.unit != null) return -1;
      }
      return start_i + 1;
    }
    case 'capture-content': {
      const cMatcher = matcher.inner || {type:'any'};
      const end_i = matchUnits(units, cMatcher, () => {}, start_i, context);
      if (end_i === -1) return -1;
      if (end_i === start_i) {
        oncapture('', matcher.name);
        return end_i;
      }
      if (end_i === start_i + 1) {
        oncapture(getUnitContent(units[start_i]), matcher.name);
        return end_i;
      }
      oncapture(units.slice(start_i, end_i).map(getUnitContent).join(''), matcher.name);
      return end_i;
    }
    default: {
      return -1;
    }
  }
}

export function replacePlaceholders(matcher: UnitMatcher, placeholders: Map<string, UnitMatcher>): UnitMatcher;
export function replacePlaceholders(matchers: Map<string, UnitMatcher>, placeholders: Map<string, UnitMatcher>): Map<string, UnitMatcher>;
export function replacePlaceholders(matcher: UnitMatcher | Map<string, UnitMatcher>, placeholders: Map<string, UnitMatcher>): UnitMatcher | Map<string, UnitMatcher> {
  if (matcher instanceof Map) {
    const result = new Map<string, UnitMatcher>();
    for (const name of matcher.keys()) {
      result.set(name, {} as UnitMatcher);
    }
    const combined = new Map<string, UnitMatcher>(placeholders);
    for (const [name, value] of result) {
      combined.set(name, value);
    }
    for (const [name, value] of result) {
      Object.assign(value, replacePlaceholders(matcher.get(name)!, combined));
    }
    return result;
  }
  switch (matcher.type) {
    case 'placeholder': {
      let replace = placeholders.get(matcher.placeholder);
      if (!replace) {
        throw new Error('placeholder not found: ' + matcher.placeholder);
      }
      while (replace.type === 'placeholder') {
        const placeholder = replace.placeholder;
        replace = placeholders.get(placeholder);
        if (!replace) {
          throw new Error('placeholder not found: ' + placeholder);
        }
      }
      return replace;
    }
    case 'alternate': {
      let option_i: number;
      for (option_i = 0; option_i < matcher.options.length; option_i++) {
        const replaced = replacePlaceholders(matcher.options[option_i], placeholders);
        if (replaced !== matcher.options[option_i]) {
          const options = matcher.options.slice(0, option_i);
          options.push(replaced);
          for (option_i++; option_i < matcher.options.length; option_i++) {
            options.push(replacePlaceholders(matcher.options[option_i], placeholders));
          }
          return {type:'alternate', options};
        }
      }
      return matcher;
    }
    case 'sequence': {
      let option_i: number;
      for (option_i = 0; option_i < matcher.sequence.length; option_i++) {
        const replaced = replacePlaceholders(matcher.sequence[option_i], placeholders);
        if (replaced !== matcher.sequence[option_i]) {
          const sequence = matcher.sequence.slice(0, option_i);
          sequence.push(replaced);
          for (option_i++; option_i < matcher.sequence.length; option_i++) {
            sequence.push(replacePlaceholders(matcher.sequence[option_i], placeholders));
          }
          return {...matcher, sequence};
        }
      }
      return matcher;
    }
    case 'call': {
      const params = replacePlaceholders(matcher.params, placeholders);
      if (params !== matcher.params) {
        return {
          ...matcher,
          params,
        };
      }
      return matcher;
    }
    case 'curly': case 'round': case 'square': {
      const contents = replacePlaceholders(matcher.contents, placeholders);
      if (contents !== matcher.contents) {
        return {
          ...matcher,
          contents,
        };
      }
      return matcher;
    }
    case 'subset': {
      let option_i: number;
      for (option_i = 0; option_i < matcher.set.length; option_i++) {
        const replaced = replacePlaceholders(matcher.set[option_i], placeholders);
        if (replaced !== matcher.set[option_i]) {
          const set = matcher.set.slice(0, option_i);
          set.push(replaced);
          for (option_i++; option_i < matcher.set.length; option_i++) {
            set.push(replacePlaceholders(matcher.set[option_i], placeholders));
          }
          return {...matcher, set};
        }
      }
      return matcher;
    }
    case 'capture-array': case 'capture-object': case 'capture-reduce':
    case 'capture-transform': case 'capture-unit': case 'capture-content':
    case 'capture-named': case 'repeat': {
      if (matcher.inner) {
        const inner = replacePlaceholders(matcher.inner, placeholders);
        if (inner !== matcher.inner) {
          return {...matcher, inner};
        }
      }
      return matcher;
    }
    default: return matcher;
  }
}

function getUnitContent(unit: Unit): string | number {
  switch (unit.type) {
    case 'at-identifier': case 'identifier': case 'hash':
    case 'string': case 'symbol': {
      return unit.content;
    }
    case 'number': {
      return unit.value;
    }
    case 'curly': case 'round': case 'square': {
      const values = unit.content.map(getUnitContent);
      return values.length === 1 ? values[0] : values.join('');
    }
    case 'call': {
      const values = unit.params.map(getUnitContent);
      return values.length === 1 ? values[0] : values.join('');
    }
    default: {
      return '';
    }
  }
}

const parenthesized: UnitMatcher.Container = {
  type: 'round',
  contents: {
    // placeholder to be replaced later
    type: 'any',
  },
};

const atomic = {
  type: 'capture-transform',
  transform(m, min, max) {
    if (max === true) {
      max = min;
    }
    if (min === 1 && max === 1) {
      return m;
    }
    return {
      type: 'repeat',
      min: min as number,
      max: max as number,
      inner: m as UnitMatcher,
    } satisfies UnitMatcher;
  },
  inner: {
    type: 'sequence',
    sequence: [
      {
        type: 'alternate',
        options: [
          {
            type: 'capture-transform',
            transform(name) {
              return {
                type: 'placeholder',
                placeholder: name as string,
              } satisfies UnitMatcher;
            },
            inner: {
              type: 'capture-content',
              inner: {type:'identifier'},
            }
          },
          {
            type: 'capture-transform',
            inner: {
              type: 'sequence',
              sequence: [
                {
                  type: 'capture-unit',
                  inner: {
                    type: 'call',
                    funcNameMatch: /.*/,
                    params: {
                      type: 'repeat',
                      inner: {type:'any'},
                      min: 0,
                      max: Infinity,
                    },
                  },
                },
                {type: 'capture-context'},
              ],
            },
            transform(_callUnit, _context) {
              const callUnit = _callUnit as Unit.Call;
              const context = _context as {functions:Map<string, (units: Unit[], context: unknown) => UnitMatcher>};
              const func = context.functions.get(callUnit.funcName);
              if (!func) {
                throw new Error('function not defined: ' + callUnit.funcName);
              }
              const result = func(callUnit.params, context);
              return result;
            },
          },
          {
            type: 'capture-transform',
            inner: {
              type: 'capture-content',
              inner: {
                type: 'string',
              },
            },
            transform(_str) {
              const str = _str as string;
              if (str.length === 1) {
                return {
                  type: 'symbol',
                  symbol: str[0],
                };
              }
              else {
                const sequence: UnitMatcher[] = [];
                for (let i = 0; i < str.length; i++) {
                  if (i > 0) sequence.push({type:'zero-whitespace'});
                  sequence.push({type:'symbol', symbol:str[i]});
                }
                return {
                  type: 'sequence',
                  sequence,
                }
              }
            },
          },
          parenthesized,
        ],
      },
      {
        type: 'alternate',
        options: [
          {
            type: 'sequence',
            sequence: [
              {type: 'symbol', symbol: '?'},
              {type: 'capture-constant', constant: 0},
              {type: 'capture-constant', constant: 1},
            ],
          },
          {
            type: 'sequence',
            sequence: [
              {type: 'symbol', symbol: '*'},
              {type: 'capture-constant', constant: 0},
              {type: 'capture-constant', constant: Infinity},
            ],
          },
          {
            type: 'sequence',
            sequence: [
              {type: 'symbol', symbol: '+'},
              {type: 'capture-constant', constant: 1},
              {type: 'capture-constant', constant: Infinity},
            ],
          },
          {
            type: 'curly',
            contents: {
              type: 'sequence',
              sequence: [
                {type: 'capture-content', inner: {type: 'number'}},
                {
                  type: 'alternate',
                  options: [
                    {
                      type: 'sequence',
                      sequence: [
                        {type:'symbol', symbol:','},
                        {
                          type: 'alternate',
                          options: [
                            {type: 'capture-content', inner: {type:'number'}},
                            {type: 'capture-constant', constant: Infinity},
                          ],
                        },
                      ],
                    },
                    {type:'capture-constant', constant:true}
                  ],
                },
                {type:'end'},
              ]
            },
          },
          {
            type: 'sequence',
            sequence: [
              {type: 'capture-constant', constant: 1},
              {type: 'capture-constant', constant: 1},
            ],
          },
        ],
      },
    ],
  },
} satisfies UnitMatcher;

const altRule: UnitMatcher = {
  type: 'capture-transform',
  transform(...captures) {
    if (captures.length === 1) {
      return captures[0];
    }
    return {
      type: 'sequence',
      sequence: captures as UnitMatcher[],
    } satisfies UnitMatcher;
  },
  inner: {
    type: 'repeat',
    min: 0,
    max: Infinity,
    inner: atomic,
  },
};

const capRule: UnitMatcher = {
  type: 'capture-transform',
  transform(...captures): UnitMatcher {
    if (captures.length === 1) {
      return captures[0] as UnitMatcher;
    }
    return {
      type: 'alternate',
      options: captures as UnitMatcher[],
    };
  },
  inner: {
    type: 'sequence',
    sequence: [
      altRule,
      {
        type: 'repeat',
        min: 0,
        max: Infinity,
        inner: {
          type: 'sequence',
          sequence: [
            {type:'symbol', symbol:'|'},
            altRule,
          ],
        },
      }
    ],
  },
};

parenthesized.contents = capRule;

const ruleUnit: UnitMatcher = {
  type: 'capture-object',
  inner: {
    type: 'sequence',
    sequence: [
      {
        type: 'capture-content',
        inner: {
          type: 'identifier',
        },
        name: 'name',
      },
      {
        type: 'symbol',
        symbol: ':',
      },
      {
        type: 'capture-transform',
        name: 'matcher',
        transform(capture) {
          return capture;
        },
        inner: capRule,
      }
    ],
  },
};

export const ruleSetUnit: UnitMatcher = {
  type: 'capture-array',
  inner: {
    type: 'sequence',
    sequence: [
      {
        type: 'repeat',
        min: 0,
        max: 1,
        inner: {
          type: 'sequence',
          sequence: [
            ruleUnit,
            {
              type: 'repeat',
              min: 0,
              max: Infinity,
              inner: {
                type: 'sequence',
                sequence: [
                  {type: 'symbol', symbol: ';'},
                  ruleUnit
                ],
              },
            },
            {
              type: 'repeat',
              min: 0,
              max: 1,
              inner: {
                type: 'symbol',
                symbol: ';',
              },
            },
          ],
        },
      },
      {type:'end'}
    ],
  },
};

const defaultMacros = new Map<string, UnitMatcher>([
  ['number', {
    type: 'number',
  }],
  ['percentage', {
    type: 'number',
    unit: '%',
  }],
  ['string', {
    type: 'string',
  }],
  ['identifier', {
    type: 'identifier'
  }],
  ['hash', {
    type: 'hash',
  }],
  ['NONZERO_WHITESPACE', {
    type: 'nonzero-whitespace',
  }],
  ['ZERO_WHITESPACE', {
    type: 'zero-whitespace',
  }],
]);

const splitComma = (units: Unit[]) => {
  const split: Unit[][] = [];
  let current: Unit[] = [];
  split.push(current);
  for (const unit of units) {
    if (unit.type === 'symbol' && unit.content === ',') {
      split.push(current = []);
    }
    else {
      current.push(unit);
    }
  }
  return split;
};

const defaultFunctions = new Map<string, (params: Unit[], context: unknown) => UnitMatcher>([
  ['ID', (units, context) => {
    let ids: string[];
    matchUnits(
      units,
      {
        type: 'capture-array',
        inner: {
          type: 'sequence',
          sequence: [
            {
              type: 'repeat',
              min: 0,
              max: 1,
              inner: {
                type: 'sequence',
                sequence: [
                  {
                    type: 'capture-content',
                    inner: {type:'identifier'},
                  },
                  {
                    type: 'repeat',
                    inner: {
                      type: 'sequence',
                      sequence: [
                        {type: 'symbol', symbol:'|'},
                        {type: 'capture-content', inner:{type:'identifier'}}
                      ],
                    },
                    min: 0,
                    max: Infinity,
                  }
                ],
              },
            },
            {type:'end'}
          ],
        },
      },
      cap => { ids = cap as string[]; },
      0,
      context,
    )
    if (!ids!) {
      throw new Error('invalid content in ID()');
    }
    if (ids.length === 0) {
      return {
        type: 'identifier',
      };
    }
    if (ids.length === 1) {
      return {
        type: 'identifier',
        match: ids[1],
      };
    }
    return {
      type: 'alternate',
      options: ids.map(id => ({type:'identifier', match:id}))
    }
  }],
  ['HASH', (units) => {
    if (units.length === 1 && units[0].type === 'call' && units[0].funcName === 'MATCH') {
      const match = units[0];
      if (match.params.length === 1 && match.params[0].type === 'string') {
        return {
          type: 'hash',
          match: new RegExp('^(?:' + match.params[0].content + ')$', 'u'),
        };
      }
    }
    throw new Error('invalid params');
  }],
  ['FN', (units, context) => {
    if (units.length === 1 && units[0].type === 'call') {
      let result: UnitMatcher | null = null;
      matchUnits(
        units[0].params,
        capRule,
        (cap) => { result = cap as UnitMatcher; },
        0,
        context,
      );
      if (!result) {
        throw new Error('no result');
      }
      return {
        type: 'call',
        funcNameMatch: units[0].funcName,
        params: result
      };
    }
    throw new Error('invalid params');
  }],
  ['ONE_OR_MORE_ANY_ORDER', (units, context) => {
    const split = splitComma(units).map((units): UnitMatcher => {
      let result: UnitMatcher | null = null;
      matchUnits(
        units,
        capRule,
        (cap) => { result = cap as UnitMatcher; },
        0,
        context,
      );
      if (!result) {
        throw new Error('no result');
      }
      return result;
    });
    if (split.length === 1) {
      return split[0];
    }
    return {
      type: 'subset',
      set: split,
      min: 1,
    };
  }],
  ['ZERO_OR_MORE_ANY_ORDER', (units, context) => {
    const split = splitComma(units).map((units): UnitMatcher => {
      let result: UnitMatcher | null = null;
      matchUnits(
        units,
        capRule,
        (cap) => { result = cap as UnitMatcher; },
        0,
        context,
      );
      if (!result) {
        throw new Error('no result');
      }
      return result;
    });
    if (split.length === 1) {
      return split[0];
    }
    return {
      type: 'subset',
      set: split,
      min: 0,
    };
  }],
  ['ROUND', (units, context) => {
    let result: UnitMatcher | null = null;
    matchUnits(
      units,
      capRule,
      (cap) => { result = cap as UnitMatcher; },
      0,
      context,
    );
    if (!result) {
      throw new Error('no result');
    }
    return {
      type: 'round',
      contents: result,
    };
  }],
  ['SQUARE', (units, context) => {
    let result: UnitMatcher | null = null;
    matchUnits(
      units,
      capRule,
      (cap) => { result = cap as UnitMatcher; },
      0,
      context,
    );
    if (!result) {
      throw new Error('no result');
    }
    return {
      type: 'square',
      contents: result,
    };
  }],
  ['CURLY', (units, context) => {
    let result: UnitMatcher | null = null;
    matchUnits(
      units,
      capRule,
      (cap) => { result = cap as UnitMatcher; },
      0,
      context,
    );
    if (!result) {
      throw new Error('no result');
    }
    return {
      type: 'curly',
      contents: result,
    };
  }],
  ['CAP_ARRAY', (units, context) => {
    let result: UnitMatcher | null = null;
    matchUnits(
      units,
      capRule,
      (cap) => { result = cap as UnitMatcher; },
      0,
      context,
    );
    if (!result) {
      throw new Error('no result');
    }
    return {
      type: 'capture-array',
      inner: result,
    };
  }],
  ['CAP_OBJECT', (units, context) => {
    let result: UnitMatcher | null = null;
    matchUnits(
      units,
      capRule,
      (cap) => { result = cap as UnitMatcher; },
      0,
      context,
    );
    if (!result) {
      throw new Error('no result');
    }
    return {
      type: 'capture-object',
      inner: result,
    };
  }],
  ['CAP_NAMED', (units, context) => {
    units = units.filter(v => v.type !== 'whitespace' && v.type !== 'comment');
    if (units.length !== 3
        || units[0].type !== 'identifier'
        || units[1].type !== 'symbol'
        || units[1].content !== ',') {
      throw new Error('invalid params');
    }
    const name = units[0].content;
    let result: UnitMatcher | null = null;
    matchUnits(
      [units[2]],
      capRule,
      cap => { result = cap as UnitMatcher; },
      0,
      context,
    );
    if (!result) {
      throw new Error('no result');
    }
    return {
      type: 'capture-named',
      name,
      inner: result,
    };
  }],
  ['CAP_CONST', (units, context) => {
    let unit_i = 0;
    while (units[unit_i] && (units[unit_i].type === 'whitespace' || units[unit_i].type === 'comment')) {
      unit_i++;
    }
    if (unit_i >= units.length) {
      throw new Error('CAP_CONST: invalid params');
    }
    for (let after_i = unit_i + 1; after_i < units.length; after_i++) {
      if (units[after_i].type !== 'whitespace' && units[after_i].type !== 'comment') {
        throw new Error('CAP_CONST: invalid params');
      }
    }
    const unit = units[unit_i];
    switch (unit.type) {
      case 'string': {
        return {
          type: 'capture-constant',
          constant: unit.content,
        };
      }
      case 'number': {
        if (unit.unit) {
          throw new Error('CAP_CONST: invalid params');
        }
        return {
          type: 'capture-constant',
          constant: unit.value,
        }
      }
      case 'identifier': {
        switch (unit.content) {
          case 'null': return {type:'capture-constant', constant:null};
          case 'true': return {type:'capture-constant', constant:true};
          case 'false': return {type:'capture-constant', constant:false};
          case 'undefined': return {type:'capture-constant', constant:undefined};
          case 'NaN': return {type:'capture-constant', constant:NaN};
          case 'infinity': return {type:'capture-constant', constant:Infinity};
        }
        break;
      }
    }
    throw new Error('CAP_CONST: invalid params');
  }],
]);

type RuleParseContext = {
  functions: Map<string, (units: Unit[], context: RuleParseContext) => UnitMatcher>,
  macros: Map<string, UnitMatcher>,
};

export function parseRules(src: string, context: RuleParseContext) {
  const units = [...toUnits(src)];
  let cap: Array<{name:string, matcher:UnitMatcher}> | null = null;
  const newContext: RuleParseContext = {
    functions: new Map([...defaultFunctions, ...context.functions]),
    macros: new Map([...defaultMacros, ...context.macros]),
  };
  matchUnits(
    units,
    ruleSetUnit,
    c => { cap = c as any; },
    0,
    newContext,
  );
  if (cap as any == null) {
    throw new Error('failed to match');
  }
  const result = new Map(cap!.map(({ name, matcher }) => [name, matcher]));
  return replacePlaceholders(result, newContext.macros);
}
