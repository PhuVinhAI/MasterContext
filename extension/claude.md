# LARGE PROJECT CONTEXT FILE HANDLER (.txt)

The attached file is an auto-generated **project context file** containing the
entire source code of a project merged into a single .txt file.

## FILE STRUCTURE

### 1. MANIFEST (top of file)
\`\`\`
===MANIFEST_START===
{
  "index": [
    {
      "file": "src/App.tsx",
      "lang": "tsx",
      "line_start": 1629,   ← exact line of the #FILE header in the file
      "lines": 701,          ← number of content lines
      "size_kb": 22.07
    },
    ...
  ],
  "sections": ["root", "src", "src/store", ...],
  "total_files": 108
}
===MANIFEST_END===
\`\`\`

### 2. SECTIONS & FILES (body)
\`\`\`
===SECTION: src/store===

#FILE src/store/types.ts ts 262 8.5kb
...file content...
#ENDFILE

===ENDSECTION===
\`\`\`

### 3. ALWAYS APPLY (bottom of file, if present)
Project-wide instructions that must always be followed.

---

## WORKING PRINCIPLES

**NEVER** attempt to read the entire file. Always use `bash_tool` with targeted
Unix commands following this workflow:

### Step 1 — Measure first
\`\`\`bash
wc -l file.txt && wc -c file.txt
\`\`\`

### Step 2 — Read the manifest once
\`\`\`bash
grep -n "===MANIFEST_END===" file.txt   # find where manifest ends
sed -n '1,NUMp' file.txt               # read the full manifest
\`\`\`
→ This gives a complete map: every file, its line number, and its size.

### Step 3 — Teleport directly to any file
\`\`\`bash
# From manifest: line_start=1629, lines=701 → end=1629+701=2330
sed -n '1629,2330p' file.txt   # read exactly that file, skip everything else
\`\`\`

### Step 4 — Global pattern queries (when needed)
\`\`\`bash
# Find all imports of a specific module
grep "import.*from.*zustand" file.txt

# List all files by extension
grep "^#FILE.*\.rs" file.txt

# Find small files only (< 50 lines) for quick reads
grep "^#FILE" file.txt | awk '$4 < 50'

# Find files within a specific domain/folder
grep "^#FILE.*store/" file.txt
\`\`\`

---

## READING PRIORITY ORDER

1. **Manifest first** — understand overall structure, tech stack, file count
2. **Config files** — `package.json`, `tsconfig`, `*.config.*`
   to identify frameworks, dependencies, and conventions
3. **Entry points** — `main.tsx`, `App.tsx`, `lib.rs`, `mod.rs`, etc.
4. **Files directly relevant** to the current task or question
5. **Read more as needed** — never read ahead without a clear reason

---

## IMPORTANT NOTES

- File content has been **pre-processed**: comments and debug logs are stripped
- `line_start` values in the manifest are **guaranteed accurate** — use directly
- Prefer `sed -n` over `grep -n` + `sed` once line numbers are known
- For files > 1MB: **never use `cat`**, avoid unscoped `head` beyond 200 lines
- Always check for `===ALWAYS APPLY===` at the bottom — treat it as mandatory context