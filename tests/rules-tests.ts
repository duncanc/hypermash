
import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eachToken, FlatToken } from '../src/rules-handling';

test('rules tokenization', async (ctx) => {

  const assertEqualTokens = (text: string, tokens: FlatToken[]) => {
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
          {type:'string', content: "\"\\OK3\r\n"},
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
          {type:'string', content: "'\\OK3\r\n"},
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

});
