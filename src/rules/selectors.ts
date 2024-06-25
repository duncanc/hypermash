
import { parseRules } from "../rules-handling";

const map = parseRules(`
  selectors: CAP_ARRAY( selector (',' selector)* );
  selector: CAP_OBJECT(
    CAP_NAMED(initial, -selector-unit)
    CAP_NAMED(subsequent, CAP_ARRAY( CAP_OBJECT(CAP_NAMED(combinator, -combinator) CAP_NAMED(unit, -selector-unit))+ ))?
  );
  -combinator: (
    '>' CAP_CONST('child') |
    '+' CAP_CONST('next-sibling') |
    '~' CAP_CONST('subsequent-sibling') |
    ('|' ZERO_WHITESPACE '|') CAP_CONST('grid') |
    NONZERO_WHITESPACE CAP_CONST('descendant')
  );
  -selector-unit: CAP_ARRAY(
    (-type-selector | -subclass-selector)
    (ZERO_WHITESPACE -subclass-selector)*
  );
  -type-selector: CAP_OBJECT(
    CAP_NAMED(namespace,
      (CAP(identifier) | '*' CAP_CONST(true))
      ZERO_WHITESPACE '|' ZERO_WHITESPACE
    )?
    CAP_NAMED(name,
      CAP(identifier) | '*' CAP_CONST(true)
    )
    CAP_NAMED(type, CAP_CONST('element'))
  );
  -subclass-selector: CAP_OBJECT(
    (CAP_NAMED(id, CAP(hash)) CAP_NAMED(type, CAP_CONST('id')))
    | ('.' ZERO_WHITESPACE CAP_NAMED(className, CAP(identifier)) CAP_NAMED(type, CAP_CONST('class')))
    | SQUARE(
      CAP_NAMED(type, CAP_CONST('attribute'))
      CAP_NAMED(namespace,
        (CAP(identifier) | '*' CAP_CONST(true))
        ZERO_WHITESPACE '|' ZERO_WHITESPACE
      )?
      CAP_NAMED(name, CAP(identifier))
      ((
        CAP_NAMED(operator,
          ((
            (
              '~' CAP_CONST('word-list-contains') |
              '|' CAP_CONST('equals-or-dashed-prefix') |
              '^' CAP_CONST('starts-with') |
              '$' CAP_CONST('ends-with') |
              '*' CAP_CONST('has-substring')
            )
            ZERO_WHITESPACE
          ) | CAP_CONST('equals'))
          '='
        )
        CAP_NAMED(value, CAP(string | identifier))
        CAP_NAMED(caseSensitive,
          ID(i) CAP_CONST(false) |
          ID(s) CAP_CONST(true)
        )?
      ) | CAP_NAMED(operator, CAP_CONST('present')))
    )
    | (':' ZERO_WHITESPACE
      CAP_OBJECT(
        (
          ':' ZERO_WHITESPACE
          (
            CAP_NAMED(name, CAP(identifier))
            CAP_NAMED(type, CAP_CONST('pseudo-element'))
            |
            CAP_NAMED(funcUnit, CAP_UNIT(call))
            CAP_NAMED(type, CAP_CONST('pseudo-element-func'))
          )
        ) | (
          CAP_NAMED(name, CAP(identifier))
          CAP_NAMED(type, CAP_CONST('pseudo-class'))
          |
          CAP_NAMED(funcUnit, CAP_UNIT(call))
          CAP_NAMED(type, CAP_CONST('pseudo-class-func'))
        )
      )
    )
  );
`, {
  functions: new Map(),
  macros: new Map(),
})

export const selector = map.get('selector')!;
export const selectors = map.get('selectors')!;
