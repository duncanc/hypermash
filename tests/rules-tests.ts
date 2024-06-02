
import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eachToken, Token, matchUnits, toUnits, Unit, UnitMatcher } from '../src/rules-handling';

test('rules tokenization', async (ctx) => {

  const assertEqualTokens = (text: string, tokens: Token[]) => {
    assert.deepEqual([...eachToken(text)], tokens);
  }

  await ctx.test('whitespace', (ctx) => {
    assertEqualTokens(' \r\n \t \f \r \n ', [
      {type:'whitespace', content:' \r\n \t \f \r \n '}
    ])
  });

  await ctx.test('comments', async (ctx) => {
    await ctx.test('simple comment', async (ctx) => {
      assertEqualTokens('/* bla bla */', [
        {type:'comment', content:' bla bla '},
      ]);
    });

    await ctx.test('comment nesting (lack thereof)', async (ctx) => {
      assertEqualTokens('/* nested /* comments are */ not supported */', [
        {type: 'comment', content: ' nested /* comments are '},
        {type: 'whitespace', content: ' '},
        {type: 'identifier', content: 'not'},
        {type: 'whitespace', content: ' '},
        {type: 'identifier', content: 'supported'},
        {type: 'whitespace', content: ' '},
        {type: 'symbol', content:'*'},
        {type: 'symbol', content:'/'},
      ]);
    });
    
  });

  await ctx.test('identifiers', async ctx => {

    await ctx.test('simple identifiers', async ctx => {
      assertEqualTokens('an_identifier-123e9', [
        {type: 'identifier', content:'an_identifier-123e9'},
      ]);

      assertEqualTokens('-single-dash-identifier', [
        {type: 'identifier', content:'-single-dash-identifier'},
      ]);

      assertEqualTokens('--1-double-dash-identifier', [
        {type: 'identifier', content:'--1-double-dash-identifier'},
      ]);
    });

    await ctx.test('identifiers with escapes', async (ctx) => {
      assertEqualTokens(' \\  ', [
        {type: 'whitespace', content: ' '},
        {type: 'identifier', content: ' '},
        {type: 'whitespace', content: ' '},
      ]);

      assertEqualTokens('\\4F \\00004B3', [
        {type: 'identifier', content: 'OK3'},
      ]);
    });

  });

  await ctx.test('calls', async ctx => {

    await ctx.test('simple calls', async ctx => {
      assertEqualTokens('an_identifier-123e9()', [
        {type: 'call-open', content:'an_identifier-123e9'},
        {type: 'symbol', content:')'},
      ]);

      assertEqualTokens('-single-dash-identifier()', [
        {type: 'call-open', content:'-single-dash-identifier'},
        {type: 'symbol', content:')'},
      ]);

      assertEqualTokens('--1-double-dash-identifier()', [
        {type: 'call-open', content:'--1-double-dash-identifier'},
        {type: 'symbol', content:')'},
      ]);
    });

    await ctx.test('identifiers with escapes', async (ctx) => {
      assertEqualTokens(' \\ () ', [
        {type: 'whitespace', content: ' '},
        {type: 'call-open', content: ' '},
        {type: 'symbol', content:')'},
        {type: 'whitespace', content: ' '},
      ]);

      assertEqualTokens('\\4F \\00004B3()', [
        {type: 'call-open', content: 'OK3'},
        {type: 'symbol', content:')'},
      ]);
    });

  });

  await ctx.test('at-identifiers', async ctx => {

    await ctx.test('simple identifiers', async ctx => {
      assertEqualTokens('@an_identifier-123e9', [
        {type: 'at-identifier', content:'an_identifier-123e9'},
      ]);

      assertEqualTokens('@-single-dash-identifier', [
        {type: 'at-identifier', content:'-single-dash-identifier'},
      ]);

      assertEqualTokens('@--1-double-dash-identifier', [
        {type: 'at-identifier', content:'--1-double-dash-identifier'},
      ]);
    });

    await ctx.test('identifiers with escapes', async (ctx) => {
      assertEqualTokens(' @\\  ', [
        {type: 'whitespace', content: ' '},
        {type: 'at-identifier', content: ' '},
        {type: 'whitespace', content: ' '},
      ]);

      assertEqualTokens('@\\4F \\00004B3', [
        {type: 'at-identifier', content: 'OK3'},
      ]);
    });

    await ctx.test('url token', async (ctx) => {

      assertEqualTokens('url(/some.thing#blah)', [
        {type:'url', content:'/some.thing#blah'},
      ]);

      assertEqualTokens('\\U\\R\\L(/some.thing#blah)', [
        {type:'url', content:'/some.thing#blah'},
      ]);

      assertEqualTokens('\\75\\0052\t\\00006c\r\n(/some.thing#blah)', [
        {type:'url', content:'/some.thing#blah'},
      ]);

      assertEqualTokens('url(  /some.thing#blah \t )', [
        {type:'url', content:'/some.thing#blah'},
      ]);

      assertEqualTokens('url("/some.thing#blah")', [
        {type:'call-open', content:'url'},
        {type:'string', content:'/some.thing#blah'},
        {type:'symbol', content:')'},
      ]);

    });

  });

  await ctx.test('hash', async ctx => {

    await ctx.test('simple identifiers', async ctx => {
      assertEqualTokens('#an_identifier-123e9', [
        {type: 'hash', content:'an_identifier-123e9'},
      ]);

      assertEqualTokens('#1-digit-begins', [
        {type: 'hash', content:'1-digit-begins'},
      ]);
    });

    await ctx.test('identifiers with escapes', async (ctx) => {
      assertEqualTokens(' #\\  ', [
        {type: 'whitespace', content: ' '},
        {type: 'hash', content: ' '},
        {type: 'whitespace', content: ' '},
      ]);

      assertEqualTokens('#\\4F \\00004B3', [
        {type: 'hash', content: 'OK3'},
      ]);
    });

  });

  await ctx.test('numbers', async ctx => {

    await ctx.test('plain numbers', async ctx => {
      assertEqualTokens('100', [
        {type: 'number', value: 100},
      ]);
      assertEqualTokens('0.5', [
        {type: 'number', value: 0.5},
      ]);
      assertEqualTokens('-.25', [
        {type: 'number', value:-.25},
      ])
    });

    await ctx.test('scientific notation', async ctx => {
      assertEqualTokens('1e3', [
        {type: 'number', value: 1e3},
      ]);
      assertEqualTokens('1E5', [
        {type: 'number', value: 1E5},
      ]);
      assertEqualTokens('-1e+2', [
        {type: 'number', value: -1e+2},
      ]);
      assertEqualTokens('1E-5', [
        {type: 'number', value: 1E-5},
      ]);
    });

    await ctx.test('dimensions and percentages', async ctx => {
      assertEqualTokens('3px', [
        {type: 'number', value: 3, unit: 'px'},
      ]);
      assertEqualTokens('-11%', [
        {type: 'number', value: -11, unit: '%'},
      ]);
      assertEqualTokens('2.5e', [
        {type: 'number', value: 2.5, unit: 'e'},
      ]);
      assertEqualTokens('45deg', [
        {type: 'number', value: 45, unit: 'deg'},
      ]);
      assertEqualTokens('1e3e3', [
        {type: 'number', value: 1e3, unit: 'e3'},
      ]);
    });

  });

  await ctx.test('strings', async ctx => {

    await ctx.test('double quoted', async ctx => {
      await ctx.test('simple string', async ctx => {
        assertEqualTokens(`"blah"`, [
          {type:'string', content:'blah'},
        ]);
      });
      await ctx.test('escapes', async ctx => {
        assertEqualTokens(String.raw `"\"\\\4F \00004B3${'\\\r\n'}"`, [
          {type:'string', content: "\"\\OK3"},
        ])
      });
      await ctx.test('unterminated (end of content)', async ctx => {
        let error: unknown = null;
        try {
          for (const tok of eachToken('"')) { }
        }
        catch (e) {
          error = e;
        }
        assert.ok(error instanceof SyntaxError, 'unterminated string did not produce syntax error');
      });
      await ctx.test('unterminated (unescaped newline)', async ctx => {
        let error: unknown = null;
        try {
          for (const tok of eachToken('"string\r\n"')) { }
        }
        catch (e) {
          error = e;
        }
        assert.ok(error instanceof SyntaxError, 'unterminated string did not produce syntax error');
      });
    });

    await ctx.test('single quoted', async ctx => {
      await ctx.test('simple string', async ctx => {
        assertEqualTokens(`'blah'`, [
          {type:'string', content:'blah'},
        ]);
      });
      await ctx.test('escapes', async ctx => {
        assertEqualTokens(String.raw `'\'\\\4F \00004B3${'\\\r\n'}'`, [
          {type:'string', content: "'\\OK3"},
        ])
      });
      await ctx.test('unterminated (end of content)', async ctx => {
        let error: unknown = null;
        try {
          for (const tok of eachToken(`'`)) { }
        }
        catch (e) {
          error = e;
        }
        assert.ok(error instanceof SyntaxError, 'unterminated string did not produce syntax error');
      });
      await ctx.test('unterminated (unescaped newline)', async ctx => {
        let error: unknown = null;
        try {
          for (const tok of eachToken("'string\r\n'")) { }
        }
        catch (e) {
          error = e;
        }
        assert.ok(error instanceof SyntaxError, 'unterminated string did not produce syntax error');
      });
    });

  });

  await ctx.test('unicode ranges', async ctx => {

    assertEqualTokens('U+10-1000', [
      {type:'unicode-range', fromCodePoint:0x10, toCodePoint:0x1000},
    ]);

    assertEqualTokens('U+3fb', [
      {type:'unicode-range', fromCodePoint:0x3fb, toCodePoint:0x3fb},
    ]);

    assertEqualTokens('U+3??', [
      {type:'unicode-range', fromCodePoint:0x300, toCodePoint:0x3ff},
    ]);

    assertEqualTokens('U+??????', [
      {type:'unicode-range', fromCodePoint:0x0, toCodePoint:0x10ffff},
    ]);

  });

});

test('rules nested structure', async (ctx) => {

  await ctx.test('round brackets', async ctx => {

    await ctx.test('nested', async ctx => {
      assert.deepEqual(toUnits('( ( ( ) ) )'), [
        {
          type: 'round',
          content: [
            {type: 'whitespace', content: ' '},
            {
              type: 'round',
              content: [
                {type: 'whitespace', content: ' '},
                {
                  type: 'round',
                  content: [
                    {type: 'whitespace', content: ' '},
                  ],
                },
                {type: 'whitespace', content: ' '},
              ],
            },
            {type: 'whitespace', content: ' '},
          ],
        } satisfies Unit
      ]);
    });

    await ctx.test('unbalanced', async ctx => {

      let error: unknown = null;
      try {
        toUnits(')');
      }
      catch (e) {
        error = e;
      }
      assert.ok(error instanceof SyntaxError, 'unbalanced bracket did not produce syntax error');

      error = null;
      try {
        toUnits('(');
      }
      catch (e) {
        error = e;
      }
      assert.ok(error instanceof SyntaxError, 'unbalanced bracket did not produce syntax error');
    });

  });

  await ctx.test('function call', async ctx => {

    await ctx.test('nested', async ctx => {
      assert.deepEqual(toUnits('a( b( c( ) ) )'), [
        {
          type: 'call',
          funcName: 'a',
          params: [
            {type: 'whitespace', content: ' '},
            {
              type: 'call',
              funcName: 'b',
              params: [
                {type: 'whitespace', content: ' '},
                {
                  type: 'call',
                  funcName: 'c',
                  params: [
                    {type: 'whitespace', content: ' '},
                  ],
                },
                {type: 'whitespace', content: ' '},
              ],
            },
            {type: 'whitespace', content: ' '},
          ],
        } satisfies Unit
      ]);
    });

    await ctx.test('unbalanced', async ctx => {

      let error: unknown = null;
      error = null;
      try {
        toUnits('a(');
      }
      catch (e) {
        error = e;
      }
      assert.ok(error instanceof SyntaxError, 'unbalanced bracket did not produce syntax error');
    });

  });

  await ctx.test('square brackets', async ctx => {

    await ctx.test('nested', async ctx => {
      assert.deepEqual(toUnits('[ [ [ ] ] ]'), [
        {
          type: 'square',
          content: [
            {type: 'whitespace', content: ' '},
            {
              type: 'square',
              content: [
                {type: 'whitespace', content: ' '},
                {
                  type: 'square',
                  content: [
                    {type: 'whitespace', content: ' '},
                  ],
                },
                {type: 'whitespace', content: ' '},
              ],
            },
            {type: 'whitespace', content: ' '},
          ],
        } satisfies Unit
      ]);
    });

    await ctx.test('unbalanced', async ctx => {

      let error: unknown = null;
      try {
        toUnits(']');
      }
      catch (e) {
        error = e;
      }
      assert.ok(error instanceof SyntaxError, 'unbalanced bracket did not produce syntax error');

      error = null;
      try {
        toUnits('[');
      }
      catch (e) {
        error = e;
      }
      assert.ok(error instanceof SyntaxError, 'unbalanced bracket did not produce syntax error');
    });

  });

  await ctx.test('curly brackets', async ctx => {

    await ctx.test('nested', async ctx => {
      assert.deepEqual(toUnits('{ { { } } }'), [
        {
          type: 'curly',
          content: [
            {type: 'whitespace', content: ' '},
            {
              type: 'curly',
              content: [
                {type: 'whitespace', content: ' '},
                {
                  type: 'curly',
                  content: [
                    {type: 'whitespace', content: ' '},
                  ],
                },
                {type: 'whitespace', content: ' '},
              ],
            },
            {type: 'whitespace', content: ' '},
          ],
        } satisfies Unit
      ]);
    });

    await ctx.test('unbalanced', async ctx => {

      let error: unknown = null;
      try {
        toUnits('}');
      }
      catch (e) {
        error = e;
      }
      assert.ok(error instanceof SyntaxError, 'unbalanced bracket did not produce syntax error');

      error = null;
      try {
        toUnits('{');
      }
      catch (e) {
        error = e;
      }
      assert.ok(error instanceof SyntaxError, 'unbalanced bracket did not produce syntax error');
    });

  });

  await ctx.test('ignore comments and whitespace', async ctx => {

    assert.deepEqual(
      toUnits(' /* blah */  10 \r\n   \f  ', { ignoreComments: true, ignoreWhitespace: true}),
      [
        {type:'number', value:10},
      ] satisfies Unit[]
    );

  });

});

test('rules matching', async (ctx) => {

  await ctx.test('any token', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('3'),
        {
          type: 'any',
        } satisfies UnitMatcher,
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits(''),
        {
          type: 'any',
          } satisfies UnitMatcher,
      ),
      -1,
    );

  });

  await ctx.test('end token', async ctx => {

    assert.equal(
      matchUnits(
        toUnits(''),
        {
          type: 'end',
        } satisfies UnitMatcher,
      ),
      0,
    );

    assert.equal(
      matchUnits(
        toUnits('1'),
        {
          type: 'end',
        } satisfies UnitMatcher,
      ),
      -1,
    );

  });

  await ctx.test('symbols', async ctx => {
    assert.equal(
      matchUnits(
        toUnits('*'),
        {
          type: 'symbol',
          symbol: '*'
        }
      ),
      1,
    );
  });

  await ctx.test('unicode range', async ctx => {
    assert.equal(
      matchUnits(
        toUnits('U+fff'),
        {
          type: 'unicode-range'
        }
      ),
      1,
    );
  });

  await ctx.test('numbers', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('3'),
        {
          type: 'number',
        }
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('3px'),
        {
          type: 'number',
        }
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('3px'),
        {
          type: 'number',
          unit: 'px',
        }
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('3'),
        {
          type: 'number',
          unit: 'px',
        }
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('3%'),
        {
          type: 'number',
          unit: new Set(['px', 'in', '%', 'fr']),
        }
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('3em'),
        {
          type: 'number',
          unit: new Set(['px', 'in', '%', 'fr']),
        }
      ),
      -1,
    );

  });

  await ctx.test('alternate', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('*'),
        {
          type: 'alternate',
          options: [
            {type:'symbol', symbol:'*'},
            {type:'symbol', symbol:'/'},
          ],
        } satisfies UnitMatcher,
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('%'),
        {
          type: 'alternate',
          options: [
            {type:'symbol', symbol:'*'},
            {type:'symbol', symbol:'/'},
          ],
        } satisfies UnitMatcher,
      ),
      -1,
    );

  });

  await ctx.test('sequence', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('*/%'),
        {
          type: 'sequence',
          sequence: [
            {type:'symbol', symbol:'*'},
            {type:'symbol', symbol:'/'},
          ],
        } satisfies UnitMatcher,
      ),
      2,
    );

    assert.equal(
      matchUnits(
        toUnits('/*%'),
        {
          type: 'sequence',
          sequence: [
            {type:'symbol', symbol:'%'},
            {type:'symbol', symbol:'*'},
          ],
        } satisfies UnitMatcher,
      ),
      -1,
    );

  });

  await ctx.test('repeat', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('***'),
        {
          type: 'repeat',
          inner: {type:'symbol', symbol:'*'},
          min: 0,
          max: Infinity,
        } satisfies UnitMatcher,
      ),
      3,
    );

    assert.equal(
      matchUnits(
        toUnits('***'),
        {
          type: 'repeat',
          inner: {type:'symbol', symbol:'*'},
          min: 0,
          max: 2,
        } satisfies UnitMatcher,
      ),
      2,
    );

    assert.equal(
      matchUnits(
        toUnits('***'),
        {
          type: 'repeat',
          inner: {type:'symbol', symbol:'*'},
          min: 5,
          max: Infinity,
        } satisfies UnitMatcher,
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('~~~'),
        {
          type: 'repeat',
          inner: {type:'symbol', symbol:'*'},
          min: 0,
          max: Infinity,
        } satisfies UnitMatcher,
      ),
      0,
    );

  });

  await ctx.test('subset match', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('<>*<'),
        {
          type: 'subset',
          set: [
            {type:'symbol', symbol:'*'},
            {type:'symbol', symbol:'>'},
            {type:'symbol', symbol:'<'},
          ],
          min: 0,
          max: Infinity,
        } satisfies UnitMatcher,
      ),
      3,
    );

    assert.equal(
      matchUnits(
        toUnits('<>*<'),
        {
          type: 'subset',
          set: [
            {type:'symbol', symbol:'*'},
            {type:'symbol', symbol:'>'},
            {type:'symbol', symbol:'<'},
          ],
          min: 0,
          max: 2,
        } satisfies UnitMatcher,
      ),
      2,
    );

    assert.equal(
      matchUnits(
        toUnits('!!!!'),
        {
          type: 'subset',
          set: [
            {type:'symbol', symbol:'*'},
            {type:'symbol', symbol:'>'},
            {type:'symbol', symbol:'<'},
          ],
          min: 0,
          max: Infinity,
        } satisfies UnitMatcher,
      ),
      0,
    );

    assert.equal(
      matchUnits(
        toUnits('!!!!'),
        {
          type: 'subset',
          set: [
            {type:'symbol', symbol:'*'},
            {type:'symbol', symbol:'>'},
            {type:'symbol', symbol:'<'},
          ],
          min: 1,
          max: Infinity,
        } satisfies UnitMatcher,
      ),
      -1,
    );

  });

  await ctx.test('identifier', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('ident'),
        {
          type: 'identifier',
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('ident'),
        {
          type: 'identifier',
          match: '^ident',
        },
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('ident'),
        {
          type: 'identifier',
          match: /^ident/,
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('ident'),
        {
          type: 'identifier',
          match: 'ident',
        },
      ),
      1,
    );

  });

  await ctx.test('at-identifier', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('@ident'),
        {
          type: 'at-identifier',
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('@ident'),
        {
          type: 'at-identifier',
          match: '^ident',
        },
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('@ident'),
        {
          type: 'at-identifier',
          match: /^ident/,
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('@ident'),
        {
          type: 'at-identifier',
          match: 'ident',
        },
      ),
      1,
    );

  });

  await ctx.test('hash', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('#ident'),
        {
          type: 'hash',
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('#ident'),
        {
          type: 'hash',
          match: '^ident',
        },
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('#ident'),
        {
          type: 'hash',
          match: /^ident/,
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('#ident'),
        {
          type: 'hash',
          match: 'ident',
        },
      ),
      1,
    );

  });

  await ctx.test('brackets', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('()'),
        {
          type: 'round',
          contents: {type:'end'}
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('[]'),
        {
          type: 'square',
          contents: {type:'end'}
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('{}'),
        {
          type: 'curly',
          contents: {type:'end'}
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('(1)'),
        {
          type: 'round',
          contents: {type:'end'}
        },
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('[1]'),
        {
          type: 'square',
          contents: {type:'end'}
        },
      ),
      -1,
    );

    assert.equal(
      matchUnits(
        toUnits('{1}'),
        {
          type: 'curly',
          contents: {type:'end'}
        },
      ),
      -1,
    );

  });

  await ctx.test('call', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('ident()'),
        {
          type: 'call',
          params: {type:'end'},
          funcNameMatch: 'ident'
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('ident()'),
        {
          type: 'call',
          params: {type:'end'},
          funcNameMatch: /de/,
        },
      ),
      1,
    );

    assert.equal(
      matchUnits(
        toUnits('ident(1)'),
        {
          type: 'call',
          params: {type:'end'},
          funcNameMatch: 'ident'
        },
      ),
      -1,
    );

  });

  await ctx.test('whitespace handling', async ctx => {

    assert.equal(
      matchUnits(
        toUnits('+='),
        {
          type: 'sequence',
          sequence: [
            {type:'symbol', symbol:'+'},
            {type:'zero-whitespace'},
            {type:'symbol', symbol:'='},
          ],
        },
      ),
      2
    );

    assert.equal(
      matchUnits(
        toUnits('+ ='),
        {
          type: 'sequence',
          sequence: [
            {type:'symbol', symbol:'+'},
            {type:'zero-whitespace'},
            {type:'symbol', symbol:'='},
          ],
        },
      ),
      -1
    );

    assert.equal(
      matchUnits(
        toUnits('+ ='),
        {
          type: 'sequence',
          sequence: [
            {type:'symbol', symbol:'+'},
            {type:'nonzero-whitespace'},
            {type:'symbol', symbol:'='},
          ],
        },
      ),
      3
    );

    assert.equal(
      matchUnits(
        toUnits('+='),
        {
          type: 'sequence',
          sequence: [
            {type:'symbol', symbol:'+'},
            {type:'nonzero-whitespace'},
            {type:'symbol', symbol:'='},
          ],
        },
      ),
      -1
    );

  });

  await ctx.test('capture constant', async ctx => {
    let capture: unknown = undefined;
    assert.equal(
      matchUnits(
        toUnits(''),
        {
          type: 'capture-constant',
          constant: true,
        },
        cap => { capture = cap; },
      ),
      0,
    );
    assert.equal(capture, true);
  });

  await ctx.test('capture unit', async ctx => {
    let capture: unknown = undefined;
    assert.equal(
      matchUnits(
        toUnits('3'),
        {
          type: 'capture-unit',
        },
        cap => { capture = cap; },
      ),
      1,
    );
    assert.deepEqual(capture, {
      type: 'number',
      value: 3,
    } satisfies Unit.Numeric);
  });

  await ctx.test('capture content', async ctx => {

    await ctx.test('capture number', async ctx => {
      let capture: unknown = undefined;
      assert.equal(
        matchUnits(
          toUnits('3'),
          {
            type: 'capture-content',
          },
          cap => { capture = cap; },
        ),
        1,
      );
      assert.equal(capture, 3);
    });

    await ctx.test('capture string', async ctx => {
      let capture: unknown = undefined;
      assert.equal(
        matchUnits(
          toUnits('"hello"'),
          {
            type: 'capture-content',
          },
          cap => { capture = cap; },
        ),
        1,
      );
      assert.equal(capture, "hello");
    });

    await ctx.test('capture identifier', async ctx => {
      let capture: unknown = undefined;
      assert.equal(
        matchUnits(
          toUnits('hello'),
          {
            type: 'capture-content',
          },
          cap => { capture = cap; },
        ),
        1,
      );
      assert.equal(capture, "hello");
    });

    await ctx.test('capture symbol', async ctx => {
      let capture: unknown = undefined;
      assert.equal(
        matchUnits(
          toUnits('='),
          {
            type: 'capture-content',
          },
          cap => { capture = cap; },
        ),
        1,
      );
      assert.equal(capture, "=");
    });

  });

  await ctx.test('capture array', async ctx => {
    let capture: unknown = undefined;
    assert.equal(
      matchUnits(
        toUnits('1 2 3'),
        {
          type: 'capture-array',
          inner: {
            type: "repeat",
            inner: {
              type: 'capture-content',
              inner: {
                type: 'number'
              },
            },
            min: 0,
            max: Infinity,
          }
        },
        cap => { capture = cap; },
      ),
      5,
    );
    assert.deepEqual(capture, [1, 2, 3]);
  });

  await ctx.test('capture object', async ctx => {
    let capture: unknown = undefined;
    assert.equal(
      matchUnits(
        toUnits('1 2 3'),
        {
          type: 'capture-object',
          inner: {
            type: "sequence",
            sequence: [
              {
                type: 'capture-content',
                inner: {
                  type: 'number'
                },
                name: 'a',
              },
              {
                type: 'capture-content',
                inner: {
                  type: 'number'
                },
                name: 'b',
              },
              {
                type: 'capture-content',
                inner: {
                  type: 'number'
                },
                name: 'c',
              },
            ],
          }
        },
        cap => { capture = cap; },
      ),
      5,
    );
    assert.deepEqual(capture, Object.assign(Object.create(null), {a:1, b:2, c:3}));
  });

  await ctx.test('capture reduce', async ctx => {
    let capture: unknown = undefined;
    assert.equal(
      matchUnits(
        toUnits('1 2 3'),
        {
          type: 'capture-reduce',
          inner: {
            type: "repeat",
            inner: {
              type: 'capture-content',
              inner: {
                type: 'number'
              },
            },
            min: 0,
            max: Infinity,
          },
          initialValue: 0,
          reduce: (a, b) => (a as number) + (b as number),
        },
        cap => { capture = cap; },
      ),
      5,
    );
    assert.deepEqual(capture, 6);
  });

});
