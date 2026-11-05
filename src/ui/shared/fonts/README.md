Fonts bundled with the extension UI, cut down to what the UI writes. They're most of what doesn't compress in the package, so each one holds only that.

| File                | Font                                                        | License                           | Holds                                          |
| ------------------- | ----------------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| `commit-mono.woff2` | Commit Mono 400 (Eigil Nikolajsen)                          | MIT, `LICENSE-CommitMono.txt`     | English text and the symbols below             |
| `newsreader.woff2`  | Newsreader 400, optical size pinned at 16 (Production Type) | SIL OFL 1.1, `OFL-Newsreader.txt` | English text and the symbols below             |
| `caveat.woff2`      | Caveat 600 (Impallari Type)                                 | SIL OFL 1.1, `OFL-Caveat.txt`     | Lowercase only: the picker's handwritten notes |

A character a font doesn't hold still shows, in the next font on the stack, so a label with an accent keeps working. Regenerate with fontTools, from the fonts' releases:

```sh
SYMBOLS='U+20-7E,U+A0,U+A9,U+B7,U+D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2190,U+2192,U+21E7,U+2318,U+2325,U+2713,U+2717'
pyftsubset commit-mono.ttf --unicodes="$SYMBOLS" --layout-features='calt' --flavor=woff2
pyftsubset newsreader.ttf --unicodes="$SYMBOLS" --layout-features='kern,liga,tnum,lnum' --flavor=woff2
pyftsubset caveat.ttf --unicodes='U+20,U+21,U+27,U+2C,U+2D,U+2E,U+3F,U+61-7A,U+2019' --layout-features='kern' --flavor=woff2
```
