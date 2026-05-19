/**
 * Tree-sitter grammar for mshell, a concatenative shell language.
 *
 * Token shapes track mshell/Lexer.go. Source structure is intentionally
 * flat: a file is a stream of words, where brackets/parens/braces/grids
 * group nested words.
 *
 * The set of characters that cannot appear inside a literal token follows
 * notAllowedLiteralChars in the lexer:
 *   [ ] ( ) { } < > : ; ? ! @ , * & | " ' ^
 * Identifiers may freely include any other non-whitespace character.
 */

const NOT_LITERAL = `\\[\\](){}<>:;?!@,*&|"'^\`#$\\s`;

module.exports = grammar({
  name: 'mshell',

  word: $ => $.identifier,

  extras: $ => [
    /[ \t\r\n\v\f]/,
    $.line_comment,
  ],

  rules: {
    source_file: $ => repeat($._word),

    _word: $ => choice(
      $.list,
      $.quotation,
      $.dict,
      $.grid,

      $.string,
      $.format_string,
      $.single_quoted_string,
      $.path,

      $.datetime,
      $.float,
      $.integer,

      $.boolean,

      $.env_store,
      $.env_check,
      $.env_retrieve,
      $.positional,

      $.var_retrieve,
      $.var_store,

      $.slice_indexer,
      $.indexer,
      $.end_indexer,
      $.start_indexer,

      $.match_arm_dup,
      $.prefix_quote,

      $.keyword,
      $.type_keyword,
      $.builtin,

      $.redirect_operator,
      $.execute_operator,
      $.comparison_operator,
      $.punctuation,

      $.identifier,
    ),

    list:      $ => seq('[',  repeat($._word), ']'),
    quotation: $ => seq('(',  repeat($._word), ')'),
    dict:      $ => seq('{',  repeat($._word), '}'),
    grid:      $ => seq('[|', repeat($._word), '|]'),

    line_comment: $ => token(seq('#', /[^\n]*/)),

    boolean: $ => choice('true', 'false'),

    keyword: $ => choice(
      'def', 'end',
      'if', 'iff', 'else', 'else*', '*if',
      'loop', 'match', 'break', 'continue',
      'soe', 'not', 'and', 'or',
      'read', 'str',
      'as', 'type', 'try', 'fail', 'pure',
      'VER', 'x',
    ),

    type_keyword: $ => choice('int', 'float', 'bool'),

    // Stack/IO/standard-library built-ins. mshell's lexer reports these as
    // plain literals; listing them lets highlights pick them out.
    builtin: $ => choice(
      'dup', 'swap', 'drop', 'over', 'pick', 'rot', '-rot', 'nip',
      'w', 'wl', 'we', 'wle',
      'len', 'args', 'glob',
      'toFloat', 'toInt', 'toPath', 'toDt', 'toGrid', 'toCsv', 'toCsvCell',
      'exit', 'prompt', 'stdin', '::',
      'foldl', 'map', 'each', 'eachWhile', 'filter',
      'append', 'extend', 'concat', 'reverse',
      'sort', 'sortV', 'sortBy', 'sortByCmp',
      'uniq', 'zip', 'enumerate', 'enumerateN', 'chunk', 'pop',
      'take', 'takeWhile', 'skip', 'dropWhile', 'nth',
      'insert', 'setAt', 'del',
      'sum', 'max', 'max2', 'min', 'min2', 'abs', 'inc',
      'mod', 'floor', 'ceil', 'round',
      'lines', 'unlines', 'unlinesCrLf',
      'split', 'wsplit', 'tsplit', 'join',
      'trim', 'trimStart', 'trimEnd', 'startsWith', 'endsWith',
      'lower', 'upper', 'title', 'leftPad', 'findReplace',
      'in', 'index', 'lastIndexOf', 'countSubStr',
      'parseJson', 'parseCsv', 'parseHtml', 'parseExcel',
      'readFile', 'readFileBytes', 'readTsvFile',
      'writeFile', 'appendFile',
      'fileExists', 'isDir', 'isFile', 'fileSize',
      'cp', 'mv', 'rm', 'rmf', 'mkdir', 'mkdirp', 'cd', 'pwd',
      'tempFile', 'tempFileExt', 'tempDir',
      'lsDir', 'files', 'dirs',
      'absPath', 'dirname', 'basename', 'ext', 'stem',
      'isCmd', 'hardLink', 'sha256sum', 'md5',
      'now', 'date', 'year', 'month', 'day', 'hour', 'minute',
      'dateFmt', 'isoDateFmt', 'isoDateTimeFmt',
      'isWeekend', 'isWeekday', 'dow', 'addDays',
      'toUnixTime', 'toUnixTimeMilli', 'toUnixTimeMicro', 'toUnixTimeNano',
      'fromUnixTime', 'fromUnixTimeMilli', 'fromUnixTimeMicro', 'fromUnixTimeNano',
      'toOleDate', 'fromOleDate', 'utcToCst', 'cstToUtc',
      'reMatch', 'reFindAll', 'reFindAllIndex', 'reReplace', 'reSplit',
      'just', 'none', 'isNone', 'maybe', 'bind',
      'psub', 'typeof', 'runtime', 'hostname',
      'httpGet', 'httpPost', 'urlEncode',
      'base64encode', 'base64decode', 'utf8Str', 'utf8Bytes',
      'get', 'getDef', 'set', 'setd', 'keys', 'values', 'keyValues',
      'all', 'any', 'cartesian', 'groupBy', 'listToDict',
      'repeat', 'seq', 'tab',
      'select', 'exclude', 'derive', 'updateCol', 'gridValues',
      'leftJoin', 'outerJoin', 'linearSearch', 'linearSearchIndex',
      'binPaths', 'wt', 'tt', 'ttFile', 'uw', 'tuw',
      'strCmp', 'floatCmp', 'versionSortCmp',
      'id', '2id', '3id', '2unpack', '2apply', '2each', '2tuple',
      '.s', '.b', '.def', '.env',
    ),

    string: $ => token(seq(
      '"',
      repeat(choice(/[^"\\]/, /\\./)),
      '"',
    )),

    format_string: $ => token(seq(
      '$"',
      repeat(choice(/[^"\\]/, /\\./)),
      '"',
    )),

    single_quoted_string: $ => token(seq(
      "'",
      /[^']*/,
      "'",
    )),

    path: $ => token(seq(
      '`',
      /[^`]*/,
      '`',
    )),

    // ISO-8601 prefix datetimes.
    datetime: $ => token(prec(3,
      /\d{4}-\d{2}-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?/
    )),

    float:   $ => token(prec(2, /-?\d+\.\d*/)),
    integer: $ => token(prec(1, /-?\d+/)),

    env_store:    $ => token(prec(3, /\$[A-Za-z_][A-Za-z0-9_]*!/)),
    env_check:    $ => token(prec(3, /\$[A-Za-z_][A-Za-z0-9_]*\?/)),
    env_retrieve: $ => token(prec(2, /\$[A-Za-z_][A-Za-z0-9_]*/)),
    positional:   $ => token(prec(2, /\$[0-9]+/)),

    var_retrieve: $ => token(prec(2,
      new RegExp(`@[^${NOT_LITERAL}]+`)
    )),
    var_store: $ => token(prec(3,
      new RegExp(`[A-Za-z_][^${NOT_LITERAL}]*!`)
    )),

    // Indexers — order matters; longer/more-specific forms first.
    slice_indexer: $ => token(prec(4, /\d+:-?\d+/)),
    indexer:       $ => token(prec(4, /:-?\d+:/)),
    end_indexer:   $ => token(prec(3, /:-?\d+/)),
    start_indexer: $ => token(prec(3, /\d+:/)),

    match_arm_dup: $ => ':>',

    prefix_quote: $ => token(prec(2,
      new RegExp(`[A-Za-z_][^${NOT_LITERAL}]*\\.`)
    )),

    redirect_operator: $ => choice(
      '>', '>>', '2>', '2>>', '&>', '&>>',
      '<', '<>',
      '*', '*b', '^', '^b',
    ),

    execute_operator: $ => choice(';', '!', '?'),

    comparison_operator: $ => choice('!=', '<=', '>='),

    punctuation: $ => choice('&', '|', ',', ':'),

    // Catch-all literal/identifier. Excludes all not-allowed-literal chars
    // and the start-of-token sentinels (digits handled by the number rules;
    // `#`/`$`/quote chars are in NOT_LITERAL).
    identifier: $ => token(
      new RegExp(`[^${NOT_LITERAL}0-9][^${NOT_LITERAL}]*`)
    ),
  },
});
