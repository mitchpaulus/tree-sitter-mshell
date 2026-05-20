; Indentation rules for mshell.
;
; Uses both nvim-treesitter capture names (`@indent.begin`,
; `@indent.end`, `@indent.align`) and Helix capture names (`@indent`,
; `@outdent`). Editors that don't recognize a capture ignore it.

; Container/structural nodes — their children indent one level deeper.
[
  (list)
  (quotation)
  (dict)
  (grid)
  (definition)
  (match_block)
  (if_block)
  (prefix_quote_block)
] @indent @indent.begin

; Else / else-if branches re-indent within an if block.
[
  (elseif_branch)
  (else_branch)
] @indent @indent.begin

; Branch points dedent the marker line then re-indent contents.
[
  "else"
  "else*"
  "*if"
] @indent.branch

; Closing delimiters dedent back out.
"]"   @outdent @indent.end
")"   @outdent @indent.end
"}"   @outdent @indent.end
"|]"  @outdent @indent.end
"end" @outdent @indent.end

; Help Neovim align continuation lines with the opening delimiter when
; the user prefers visual alignment over a fixed-width indent.
[
  "["
  "("
  "{"
  "[|"
] @indent.align
