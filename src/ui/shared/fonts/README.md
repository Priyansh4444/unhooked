Fonts bundled with the extension UI, subset to Latin to keep the package small.

| File                | Font                                                        | License                           |
| ------------------- | ----------------------------------------------------------- | --------------------------------- |
| `commit-mono.woff2` | Commit Mono 400 (Eigil Nikolajsen)                          | MIT, `LICENSE-CommitMono.txt`     |
| `newsreader.woff2`  | Newsreader 400, optical size pinned at 16 (Production Type) | SIL OFL 1.1, `OFL-Newsreader.txt` |
| `caveat.woff2`      | Caveat 600, no OpenType features (Impallari Type)           | SIL OFL 1.1, `OFL-Caveat.txt`     |

Regenerate with fontTools: `pyftsubset` to U+0020–007E, U+00A0–00FF and a few punctuation marks, `--flavor=woff2`.
