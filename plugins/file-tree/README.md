# file-tree

A Claude Code Desktop mod: a side panel listing the files Claude touches.

- Files Claude is reading (blue) or editing (yellow) shimmer while the tool call runs.
- `●` edited and saved, `✗` edit failed, green name with `✓` once a `git commit` includes the file.
- Hover a row for `diff` / `file` buttons: the latest diff against HEAD, or the full file with
  jump buttons (`L12`, `◀ change`, `change ▶`) for each changed line.
- `/file-tree` toggles the panel: closes it when shown, opens it when closed.

Files changed through Bash (not Read/Edit/Write/MultiEdit/NotebookEdit) are not tracked.

## Install

```
/plugin install file-tree --marketplace yumedzi/yumedzi_claude_plugins
```
