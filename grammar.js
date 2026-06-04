/**
 * Tree-sitter grammar for mshell, a concatenative shell language.
 *
 * Token shapes track mshell/Lexer.go; structural rules track Parser.go.
 * A file is a stream of words, but the language is NOT flat — words group
 * into real tree structures that this grammar models explicitly:
 *
 *   - bracket groups: list [], quotation (), dict {}, grid [| |]
 *   - keyword blocks closed by `end`: definition, if/else, match, prefix-quote
 *   - branch sub-structure: if's elseif/else branches, match's arms, dict's
 *     key/value entries, grid's rows/cells
 *   - comma-binding chains: indexer chains (`:2:, -1:, 3:5`) and varstore
 *     lists (`a!, b!, c!`) absorb their own commas, mirroring ParseIndexer /
 *     ParseVarstoreList. Every *other* comma is a structural separator, and a
 *     bare `:` (not `:n`, `:n:`, `:>`, or `:name`) is only ever a dict/match
 *     separator — so neither `,` nor a bare `:` is a free-standing word.
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

      $.definition,
      $.match_block,
      $.if_block,
      $.prefix_quote_block,

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
      // Variable stores bind any following commas as a destructuring list
      // (`a!, b!, c!`), mirroring ParseVarstoreList; a lone `x!` is a list of
      // one. This keeps structural commas out of the generic word stream.
      $.var_store_list,

      // Indexers likewise absorb a comma-separated run (`:2:, -1:, 3:5`) as a
      // single chain, mirroring ParseIndexer.
      $.indexer_chain,

      // `:name` field getter (contiguous colon + name, no space).
      $.getter,

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

    // `{ key: value..., ... }`. Entries are comma-separated with an optional
    // trailing comma (ParseDict / parseDictKeyValue); see dict_entry for the
    // keyed and keyless forms.
    dict: $ => seq(
      '{',
      optional(seq(
        $.dict_entry,
        repeat(seq(',', $.dict_entry)),
        optional(','),
      )),
      '}',
    ),

    // An entry is `key: value...` or, inside type signatures, a keyless
    // homogeneous type (`{ int }`) or a wildcard `*: T`. The value is a run
    // of words (so `{ "k": 1 2 + }` and nested dicts both work).
    dict_entry: $ => seq(
      optional(seq(field('key', $._dict_key), ':')),
      field('value', repeat1($._word)),
    ),

    // mshell's lexer reports bare words (including builtins/keywords) as
    // LITERAL, and parseDictKeyValue accepts any literal as a key — so any
    // word-like token can be a key, not just identifiers.
    _dict_key: $ => choice(
      $.string,
      $.single_quoted_string,
      $.integer,
      $.identifier,
      $.builtin,
      $.keyword,
      $.type_keyword,
      $.boolean,
      '*',
    ),

    // `[| meta? ; col, col ; cell, cell ; ... |]`. Rows are `;`-separated
    // (`;` lexes as execute_operator and stays a word), cells within a row
    // are `,`-separated (ParseGrid). The comma is structural here; the cell
    // words and the `;` row separators stay in the body stream. Deeper
    // row/cell nesting is intentionally avoided because a bare `;` is
    // indistinguishable from an execute_operator at the grammar level.
    grid: $ => seq(
      '[|',
      repeat(choice($._word, ',')),
      '|]',
    ),

    // `def name [metadata-dict] (signature) body... end`. The name and the
    // signature quotation are required (parseDefSignature always expects a
    // `(…)`); the metadata dict is optional. Requiring them also removes the
    // ambiguity between a header part and the first body word. The name token
    // may itself look like a builtin (std.msh defines `map`, `filter`, `zip`,
    // … which the highlighter would otherwise flag).
    definition: $ => seq(
      'def',
      field('name', $._definition_name),
      optional(field('metadata', $.dict)),
      field('signature', $.quotation),
      repeat($._word),
      'end',
    ),

    _definition_name: $ => choice(
      $.identifier,
      $.builtin,
      $.type_keyword,
    ),

    // `subject match arm, arm, ... end`. Each arm is `pattern <sep> body`,
    // where the separator is `:` (consume the subject) or `:>` (keep it on
    // the stack — match-arm-dup). Arms are comma-separated with an optional
    // trailing comma before `end` (ParseMatchBlock / ParseMatchArm).
    match_block: $ => seq(
      'match',
      optional(seq(
        $.match_arm,
        repeat(seq(',', $.match_arm)),
        optional(','),
      )),
      'end',
    ),

    match_arm: $ => seq(
      field('pattern', repeat1($._word)),
      field('separator', choice(':', $.match_arm_dup)),
      field('body', repeat($._word)),
    ),

    // `condition if body [else* cond *if body]... [else body] end`.
    if_block: $ => seq(
      'if',
      repeat($._word),
      repeat($.elseif_branch),
      optional($.else_branch),
      'end',
    ),

    elseif_branch: $ => seq(
      'else*',
      repeat($._word),
      '*if',
      repeat($._word),
    ),

    else_branch: $ => seq(
      'else',
      repeat($._word),
    ),

    // `name. body end` — applies the named function over the body as if
    // the body were a quotation.
    prefix_quote_block: $ => seq(
      $.prefix_quote,
      repeat($._word),
      'end',
    ),

    line_comment: $ => token(seq('#', /[^\n]*/)),

    boolean: $ => choice('true', 'false'),

    // Keywords that do not start a structural block (`def`, `match`, `if`,
    // `else`, `else*`, `*if`, `end` are consumed by definition/match_block/
    // if_block instead).
    keyword: $ => choice(
      'iff',
      'loop', 'break', 'continue',
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

    // A varstore destructuring list: `a!, b!, c!` (trailing comma allowed).
    // A lone `x!` is a list of one. Greedy comma binding matches
    // ParseVarstoreList, so the commas here are never structural separators.
    var_store_list: $ => prec.right(seq(
      $.var_store,
      repeat(seq(',', $.var_store)),
      optional(','),
    )),

    // Indexers — order matters; longer/more-specific forms first. The start
    // of a slice/start indexer may be negative (`-3:`, `-4:-2`).
    slice_indexer: $ => token(prec(4, /-?\d+:-?\d+/)),
    indexer:       $ => token(prec(4, /:-?\d+:/)),
    end_indexer:   $ => token(prec(3, /:-?\d+/)),
    start_indexer: $ => token(prec(3, /-?\d+:/)),

    // A comma-separated run of indexers applied as one slice operation
    // (`:2:, -1:, 3:5, :2`); a lone `:5` is a chain of one (ParseIndexer).
    indexer_chain: $ => prec.right(seq(
      $._indexer,
      repeat(seq(',', $._indexer)),
      optional(','),
    )),

    _indexer: $ => choice(
      $.slice_indexer,
      $.indexer,
      $.end_indexer,
      $.start_indexer,
    ),

    // `:name` field getter — colon immediately followed by a name or a
    // quoted string (no space, which is what distinguishes it from a
    // dict/match `:` separator). The name may collide with builtins/keywords
    // (`:index`, `:name`), and a quoted form allows keys with arbitrary
    // characters (`:'children'`, `:"tag"`), so the whole thing is a single
    // token rather than `:` + word (ParseGetter).
    getter: $ => token(prec(2, choice(
      /:[A-Za-z_][A-Za-z0-9_]*/,
      /:'[^']*'/,
      /:"([^"\\]|\\.)*"/,
    ))),

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

    // `,` and `:` are not free-standing words: `,` is consumed by
    // indexer/varstore chains or acts as a dict/grid/match separator, and a
    // bare `:` is only ever a dict/match separator.
    punctuation: $ => choice('&', '|'),

    // Catch-all literal/identifier. Excludes all not-allowed-literal chars
    // and the start-of-token sentinels (digits handled by the number rules;
    // `#`/`$`/quote chars are in NOT_LITERAL).
    identifier: $ => token(
      new RegExp(`[^${NOT_LITERAL}0-9][^${NOT_LITERAL}]*`)
    ),
  },
});
