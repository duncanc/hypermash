
import { parseRules } from "../rules-handling";

const map = parseRules(`
  selectors: selector (',' selector)*;
  selector: -selector-unit (-combinator -selector-unit)*;
  -combinator: (
    '>' |
    '+' |
    '~' |
    ('|' ZERO_WHITESPACE '|') |
    NONZERO_WHITESPACE
  );
  -selector-unit: (
    (-type-selector | -subclass-selector)
    (ZERO_WHITESPACE -subclass-selector)*
  );
  -type-selector: (
    ((identifier | '*') ZERO_WHITESPACE '|' ZERO_WHITESPACE)?
    (identifier | '*')
  );
  -subclass-selector: {
    hash
    | ('.' ZERO_WHITESPACE identifier)
    | SQUARE(
      ((identifier | '*') ZERO_WHITESPACE '|' ZERO_WHITESPACE)? identifier
      (
        (
          ('~' | '|' | '^' | '$' | '*')
          ZERO_WHITESPACE
        )?
        '='
        (string | identifier)
        ID(i | s)?
      )?
    )
  };
`, {
  functions: new Map(),
  macros: new Map(),
})
