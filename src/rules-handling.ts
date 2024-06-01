
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
  if (/^\\[\r\n\f]/.test(str)) {
    // escaped newlines are omitted, not preserved
    return '';
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


type LiteralUnit = {
  type: 'comment' | 'whitespace' | 'string' | 'identifier' | 'at-identifier' | 'hash' | 'symbol';
  content: string;
};

type NumericUnit = {
  type: 'number';
  value: number;
  unit?: string;
};

type ContainerUnit = {
  type: 'curly' | 'square' | 'round';
  content: Unit[];
};

type CallUnit = {
  type: 'call';
  funcName: string;
  params: Unit[];
}

export type Unit = LiteralUnit | ContainerUnit | CallUnit | NumericUnit;

export function toUnits(
  src: string | Iterable<FlatToken> | Iterator<FlatToken>,
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
        const newCall: CallUnit = {
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
            const newBlock: ContainerUnit = {
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
            const newBlock: ContainerUnit = {
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
            const newBlock: ContainerUnit = {
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
            context.push(token as LiteralUnit);
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
        context.push(token as LiteralUnit);
        break;
      }
      case 'comment': {
        if (ignoreComments) continue;
        context.push(token as LiteralUnit);
        break;
      }
      case 'number': {
        context.push(token as NumericUnit);
        break;
      }
      default: {
        context.push(token as LiteralUnit);
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
  export type Repeat = {type:'repeat', min:number, max:number, inner:UnitMatcher};
  export type Sequence = {type:'sequence', sequence:UnitMatcher[]};
  export type Alternate = {type:'alternate', options:UnitMatcher[]};
  export type Subset = {type:'subset', set:UnitMatcher[], min: number, max?: number};
  export type Symbol = {type:'symbol', symbol:string};
  export type Identifier = {type:'identifier' | 'hash' | 'at-identifier', match?: string | RegExp};
  export type Call = {type:'call', funcNameMatch: string | RegExp, params: UnitMatcher};
  export type Container = {type: 'round' | 'square' | 'curly', contents: UnitMatcher};
  export type String = { type: 'string'; };
  export type Number = { type: 'number'; };

  export type CaptureConstant = {type: 'capture-constant', name?: string, constant:unknown};
  export type CaptureArray = {type: 'capture-array', name?: string, inner:UnitMatcher};
  export type CaptureObject = {type: 'capture-object', name?: string, inner:UnitMatcher};
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

  | UnitMatcher.CaptureConstant
  | UnitMatcher.CaptureArray
  | UnitMatcher.CaptureObject
  | UnitMatcher.CaptureTransform
  | UnitMatcher.CaptureReduce
  | UnitMatcher.CaptureUnit
  | UnitMatcher.CaptureContent
);

export function matchUnits(
  units: Unit[],
  matcher: UnitMatcher,
  oncapture = (capture: unknown, name?: string) => {},
  start_i = 0
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
        const end_i = matchUnits(units, h, oncapture, start_i);
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
      if (matchUnits(unit.params, matcher.params, oncapture, 0) !== unit.params.length) {
        return -1;
      }
      return start_i + 1;
    }
    case 'curly': case 'round': case 'square': {
      const unit = units[start_i];
      if (!unit || unit.type !== matcher.type) {
        return -1;
      }
      if (matchUnits(unit.content, matcher.contents, oncapture) !== unit.content.length) {
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
    case 'repeat': {
      let count = 0;
      let i = start_i;
      while (count < matcher.min) {
        const new_i = matchUnits(units, matcher.inner, oncapture, i);
        if (new_i === -1) return -1;
        if (new_i === i) return i;
        i = new_i;
        count++;
      }
      while (count < matcher.max) {
        const new_i = matchUnits(units, matcher.inner, oncapture, i);
        if (new_i === -1) return i;
        if (new_i === i) return i;
        i = new_i;
        count++;
      }
      return i;
    }
    case 'sequence': {
      let i = start_i;
      for (const h of matcher.sequence) {
        i = matchUnits(units, h, oncapture, i);
        if (i === -1) break;
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
          new_i = matchUnits(units, set[m_i], oncapture2, i);
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
          new_i = matchUnits(units, set[m_i], oncapture2, i);
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
    case 'capture-array': {
      const arr: unknown[] = [];
      const oncapture2 = (v: unknown) => { arr.push(v); };
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i);
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
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i);
      if (end_i === -1) {
        return -1;
      }
      oncapture(obj, matcher.name);
      return end_i;
    }
    case 'capture-constant': {
      oncapture(matcher.constant, matcher.name);
      return start_i;
    }
    case 'capture-transform': {
      const caps: unknown[] = [];
      const oncapture2 = (cap: unknown) => { caps.push(cap); };
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i);
      if (end_i === -1) {
        return -1;
      }
      oncapture(matcher.transform(...caps), matcher.name);
      return end_i;
    }
    case 'capture-reduce': {
      let cap = matcher.initialValue;
      const oncapture2 = (c: unknown) => { cap = matcher.reduce(cap, c); };
      const end_i = matchUnits(units, matcher.inner, oncapture2, start_i);
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
      const end_i = matchUnits(units, matcher.inner, ()=>{}, start_i);
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
    case 'number': {
      if (!units[start_i] || units[start_i].type !== 'number') {
        return -1;
      }
      return start_i + 1;
    }
    case 'capture-content': {
      const cMatcher = matcher.inner || {type:'any'};
      const end_i = matchUnits(units, cMatcher, () => {}, start_i);
      if (end_i === -1) return -1;
      if (end_i === start_i) {
        oncapture('');
        return end_i;
      }
      if (end_i === start_i + 1) {
        oncapture(getUnitContent(units[start_i]));
        return end_i;
      }
      oncapture(units.slice(start_i, end_i).map(getUnitContent).join(''));
      return end_i;
    }
    default: {
      return -1;
    }
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
