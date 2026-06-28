# Task cards (scoped work for the local loop)

`loop.ps1` runs these instead of asking the model to "figure out the whole repo."
The bake-off proved local models succeed when a task is scoped to its files and the
prompt is passed cleanly — these cards do exactly that.

Each `T<n>.json` card:

```json
{
  "title": "short description (used in the commit message)",
  "files": ["path/to/file/the/model/may/EDIT.js"],
  "read":  ["path/to/file/for/reference/only.js"],
  "prompt": "Precise, single-purpose instruction. Name the exact change. End with: Edit ONLY the listed file(s). Do not create, import, or add any other files."
}
```

- `files` = added to the chat as editable. Keep it to 1–2 files.
- `read`  = added read-only so the model knows the API but can't change them.
- Cards run in filename order; completed card names are recorded in `.completed`.
- The loop gates every card on `node tests/run-headless.js` and **reverts** any edit
  that turns the tests red — so a bad card can't corrupt the tree.

Write cards small and verifiable. If a task needs the model to touch many files or
make a judgment call, it's too big for the local model — split it, or build it by hand.
