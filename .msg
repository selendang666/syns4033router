docs(changelog): record the Playground global fix and the regression behind it

Two entries under Fixed, both with file:line. The first: a global entry
targets modelTarget "*" and is bound to no model, but the form required
form.model, so selecting one and pressing Run sent no request at all — the
guard answered with a toast that is green and gone in 2.5s, which reads as a
dead button. The backend was never wrong; try/route.ts:82 keeps its 400 and the
frontend now always supplies a model, so that guard is unreachable from the UI.

The second: hoisting defaultModel was necessary and the first attempt at it
crashed the page. It went into a useEffect dependency array, which is evaluated
where the call sits, while the const it names was declared further down — the
effect ran during the temporal dead zone and the component died on mount.
Vite's minifier had folded the name to `m`, so the error pointed at a variable
that does not exist in the source. Build and typecheck stayed green the whole
time; only loading the page found it.

Known issues gains a note on history granularity, since it is now visible to
anyone reading this file: syncing runs through a clean clone because one local
git object is corrupt, and `git add -A` per commit lets a commit carry more
than its message says. File contents are unaffected and verified; only git log
is imprecise.
