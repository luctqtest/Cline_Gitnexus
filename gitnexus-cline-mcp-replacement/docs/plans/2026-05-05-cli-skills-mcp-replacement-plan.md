# Plan: Replace GitNexus MCP Usage with CLI-Driven Agent Skills

Date: 2026-05-05
Owner: Future implementer
Repo: GitNexus
Goal: Provide a complete AgentSkill-based replacement for GitNexus MCP usage in environments where MCP is not allowed, especially corporate/internal environments.

---

## 1. Background

GitNexus currently exposes code intelligence to AI agents mainly through MCP:

- MCP tools are declared in `gitnexus/src/mcp/tools.ts`.
- MCP resources are declared/read through `gitnexus/src/mcp/resources.ts`.
- Real tool implementations live in `gitnexus/src/mcp/local/local-backend.ts` via `LocalBackend.callTool(...)`.
- The CLI already exposes a partial direct-tool surface in `gitnexus/src/cli/tool.ts`:
  - `query`
  - `context`
  - `impact`
  - `cypher`
  - `detect-changes`
- Group commands are exposed through `gitnexus/src/cli/group.ts`.
- Existing skill guidance lives in `gitnexus/skills/*.md`, but most examples still assume MCP-style calls or MCP resources.

The company restriction is: MCP cannot be used internally. Therefore GitNexus needs a command-based interface that AI agents can call through shell commands, then skills that teach agents when/how to call those commands.

Key architectural observation:

> MCP is only a transport layer. The reusable business logic is already inside `LocalBackend`. The correct replacement is not to duplicate MCP logic inside skills, but to expose a CLI parity layer that calls the same `LocalBackend.callTool(...)` and `readResource(...)` code paths.

---

## 2. Target Outcome

After implementation, users should be able to use GitNexus in restricted environments with:

```bash
npx gitnexus analyze
npx gitnexus query "auth flow"
npx gitnexus context "AuthService"
npx gitnexus impact "AuthService" --direction upstream
npx gitnexus call api_impact --json '{"route":"/api/users"}'
npx gitnexus read 'gitnexus://repo/my-app/context'
```

No `gitnexus mcp` process should be required for the skill workflows.

The skill set should cover every current MCP tool/resource workflow:

- Repo discovery/indexing
- Code exploration
- Debugging
- Impact analysis
- PR review
- Refactoring/rename
- API impact/route/shape checks
- Tool map analysis
- Advanced Cypher graph queries
- Multi-repo group workflows

---

## 3. Current GitNexus Surfaces

### 3.1 Existing CLI Commands

Defined mainly in `gitnexus/src/cli/index.ts`.

Important commands already available:

```bash
gitnexus setup
gitnexus analyze [path]
gitnexus index [path...]
gitnexus serve
gitnexus mcp
gitnexus list
gitnexus status
gitnexus doctor
gitnexus clean
gitnexus remove <target>
gitnexus wiki [path]
gitnexus augment <pattern>
gitnexus query <search_query>
gitnexus context [name]
gitnexus impact <target>
gitnexus cypher <query>
gitnexus detect-changes
gitnexus group ...
```

### 3.2 Current MCP Tools

Defined in `gitnexus/src/mcp/tools.ts`:

| MCP Tool | Purpose |
|---|---|
| `list_repos` | Discover indexed repos |
| `query` | Hybrid/process-grouped code search |
| `cypher` | Raw Cypher graph query |
| `context` | 360-degree symbol context |
| `detect_changes` | Map git diff to affected symbols/processes |
| `rename` | Graph-assisted rename with dry-run/apply |
| `impact` | Blast radius analysis |
| `route_map` | API route handler/consumer map |
| `tool_map` | MCP/RPC tool definitions and handlers |
| `shape_check` | API response shape vs consumer access mismatch |
| `api_impact` | Combined route/shape/impact report |
| `group_list` | List group configs |
| `group_sync` | Rebuild group Contract Registry |

### 3.3 Current MCP Resources

Defined in `gitnexus/src/mcp/resources.ts`:

| Resource | Purpose |
|---|---|
| `gitnexus://repos` | List all indexed repos |
| `gitnexus://setup` | Setup/onboarding content |
| `gitnexus://repo/{name}/context` | Repo stats, staleness, tools |
| `gitnexus://repo/{name}/clusters` | Functional areas |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Cluster detail |
| `gitnexus://repo/{name}/processes` | Execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Process trace |
| `gitnexus://repo/{name}/schema` | Graph schema |
| `gitnexus://group/{name}/contracts` | Contract registry |
| `gitnexus://group/{name}/status` | Group/repo staleness |

---

## 4. Core Implementation Strategy

Implement a CLI parity layer first:

```bash
gitnexus call <tool-name> --json '<payload>'
gitnexus read <resource-uri>
```

These commands should be thin wrappers around existing internals:

- `gitnexus call` should initialize `LocalBackend` and run `backend.callTool(toolName, payload)`.
- `gitnexus read` should initialize `LocalBackend` and run `readResource(uri, backend)` from `gitnexus/src/mcp/resources.ts`.

This allows skills to cover all MCP tools/resources without using MCP.

### 4.1 Why `call` and `read` Are Required

Some tools already have direct CLI commands, but not all:

Already covered by direct CLI:

- `query`
- `context`
- `impact`
- `cypher`
- `detect_changes`
- `list_repos` indirectly via `gitnexus list`
- many group workflows via `gitnexus group ...`

Not yet covered by direct CLI:

- `rename`
- `route_map`
- `tool_map`
- `shape_check`
- `api_impact`
- MCP resources

The universal command layer avoids having to create one hand-written CLI command per MCP tool immediately.

---

## 5. Phase 1: Add Universal CLI Tool Command

### 5.1 Add `gitnexus call <tool>`

Add file:

```text
gitnexus/src/cli/call.ts
```

Expected command:

```bash
npx gitnexus call <tool-name> --json '<payload>'
```

Optional future flags:

```bash
--pretty          Pretty-print JSON output
--raw             Print string output as-is
--repo <name>     Merge repo into JSON payload if absent
--stdin           Read JSON payload from stdin
```

Minimum v1 flags:

```bash
--json <payload>  JSON object payload; default `{}`
--pretty          Pretty-print JSON output; default true is acceptable
```

Example usage:

```bash
npx gitnexus call list_repos --json '{}'
npx gitnexus call query --json '{"query":"auth flow","limit":5}'
npx gitnexus call context --json '{"name":"AuthService","include_content":true}'
npx gitnexus call rename --json '{"symbol_name":"oldName","new_name":"newName","dry_run":true}'
npx gitnexus call api_impact --json '{"route":"/api/users"}'
```

### 5.2 Implementation Notes

Pseudo-code:

```ts
import { writeSync } from 'node:fs';
import { LocalBackend } from '../mcp/local/local-backend.js';

function output(data: unknown): void {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  writeSync(1, text + '\n');
}

function parsePayload(raw?: string): Record<string, unknown> {
  if (!raw || raw.trim() === '') return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--json must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export async function callCommand(
  tool: string,
  options?: { json?: string; pretty?: boolean; repo?: string },
): Promise<void> {
  if (!tool?.trim()) {
    console.error('Usage: gitnexus call <tool-name> --json \'{...}\'');
    process.exit(1);
  }

  const payload = parsePayload(options?.json);
  if (options?.repo && payload.repo === undefined) payload.repo = options.repo;

  const backend = new LocalBackend();
  try {
    const ok = await backend.init();
    if (!ok) {
      console.error('GitNexus: No indexed repositories found. Run: gitnexus analyze');
      process.exit(1);
    }
    const result = await backend.callTool(tool, payload);
    output(result);
  } finally {
    await backend.dispose().catch(() => {});
  }
}
```

### 5.3 Register in CLI

Edit:

```text
gitnexus/src/cli/index.ts
```

Add:

```ts
program
  .command('call <tool>')
  .description('Call a GitNexus local tool directly without MCP')
  .option('--json <payload>', 'JSON object payload for the tool', '{}')
  .option('-r, --repo <name>', 'Target repository; merged into payload if payload.repo is absent')
  .option('--pretty', 'Pretty-print JSON output')
  .action(createLazyAction(() => import('./call.js'), 'callCommand'));
```

### 5.4 Error Handling Requirements

- Invalid JSON should exit code 1 with a clear message.
- Unknown tool should print `Unknown tool: <tool>` and exit code 1.
- No indexed repo should suggest `npx gitnexus analyze`.
- Tool result objects containing `{ error: ... }` should still print JSON and use exit code 0 unless existing MCP behavior expects exception. Do not invent new semantics unless tests require it.
- Do not use `console.log` after LadybugDB init if stdout capture issues reappear; prefer `fs.writeSync(1, ...)` like `tool.ts`.

---

## 6. Phase 2: Add Universal Resource Read Command

### 6.1 Add `gitnexus read <uri>`

Add file:

```text
gitnexus/src/cli/read-resource.ts
```

Expected command:

```bash
npx gitnexus read 'gitnexus://repo/my-app/context'
```

Example usage:

```bash
npx gitnexus read 'gitnexus://repos'
npx gitnexus read 'gitnexus://setup'
npx gitnexus read 'gitnexus://repo/my-app/context'
npx gitnexus read 'gitnexus://repo/my-app/clusters'
npx gitnexus read 'gitnexus://repo/my-app/processes'
npx gitnexus read 'gitnexus://repo/my-app/schema'
npx gitnexus read 'gitnexus://group/platform/contracts'
npx gitnexus read 'gitnexus://group/platform/status'
```

### 6.2 Implementation Notes

Pseudo-code:

```ts
import { writeSync } from 'node:fs';
import { LocalBackend } from '../mcp/local/local-backend.js';
import { readResource } from '../mcp/resources.js';

export async function readResourceCommand(uri: string): Promise<void> {
  if (!uri?.trim()) {
    console.error('Usage: gitnexus read <gitnexus://... uri>');
    process.exit(1);
  }

  const backend = new LocalBackend();
  try {
    const ok = await backend.init();
    if (!ok) {
      console.error('GitNexus: No indexed repositories found. Run: gitnexus analyze');
      process.exit(1);
    }
    const content = await readResource(uri, backend);
    writeSync(1, content.endsWith('\n') ? content : content + '\n');
  } finally {
    await backend.dispose().catch(() => {});
  }
}
```

### 6.3 Register in CLI

Edit:

```text
gitnexus/src/cli/index.ts
```

Add:

```ts
program
  .command('read <uri>')
  .description('Read a GitNexus resource URI directly without MCP')
  .action(createLazyAction(() => import('./read-resource.js'), 'readResourceCommand'));
```

### 6.4 Naming Concern

`read` is short and intuitive, but if it conflicts with existing/future CLI semantics, use one of:

```bash
gitnexus resource <uri>
gitnexus get <uri>
gitnexus read-resource <uri>
```

Recommendation: use `read` unless Commander or project naming preferences object.

---

## 7. Phase 3: Update Existing Direct CLI Commands Where Needed

### 7.1 Extend `context` CLI

Current MCP `context` supports:

- `name`
- `uid`
- `file_path`
- `kind`
- `include_content`
- `repo`
- `service`

Current CLI supports only a subset:

```bash
gitnexus context [name] --repo --uid --file --content
```

Add optional flags:

```bash
--kind <kind>
--service <path>
```

### 7.2 Extend `impact` CLI

Current MCP `impact` supports many useful params:

- `target_uid`
- `file_path`
- `kind`
- `maxDepth`
- `crossDepth`
- `relationTypes`
- `includeTests`
- `minConfidence`
- `service`
- `subgroup`
- `timeoutMs`

Current CLI supports only:

```bash
--direction
--repo
--depth
--include-tests
```

Add flags gradually:

```bash
--uid <uid>
--file <path>
--kind <kind>
--cross-depth <n>
--relations <csv>
--min-confidence <n>
--service <path>
--subgroup <path>
--timeout-ms <n>
```

Alternatively document that advanced calls should use:

```bash
npx gitnexus call impact --json '{...}'
```

Recommendation: implement universal `call` first, then only add ergonomic flags if there is strong demand.

### 7.3 Add Direct Ergonomic Commands Later

Optional, after `call` is stable:

```bash
gitnexus rename <old> <new> --dry-run
gitnexus route-map [route]
gitnexus shape-check [route]
gitnexus api-impact --route <route> | --file <file>
gitnexus tool-map [tool]
```

Do not block the skill replacement on these commands.

---

## 8. Phase 4: Skill Set Design

Final skill set: 10 skills.

Skills should be command-first and MCP-free. They may mention MCP only as historical context or optional integration, not as required workflow.

Skill files can initially live in:

```text
gitnexus/skills/
```

If packaging as OpenClaw/Codex-style AgentSkills later, each skill should be a folder with `SKILL.md`. For the existing project style, `.md` files are already used and can be updated in place first.

---

## 9. Skill 1: `gitnexus-cli`

### Purpose

Use for installing, indexing, refreshing, checking, listing, cleaning, and generating wiki/docs.

### MCP Coverage

- `list_repos`
- `gitnexus://repos`
- `gitnexus://setup`
- `gitnexus://repo/{name}/context`

### Commands

```bash
npx gitnexus analyze [path]
npx gitnexus analyze --force
npx gitnexus analyze --embeddings
npx gitnexus analyze --skills
npx gitnexus analyze --skip-agents-md
npx gitnexus list
npx gitnexus status
npx gitnexus doctor
npx gitnexus clean --force
npx gitnexus remove <target> --force
npx gitnexus wiki [path]
npx gitnexus read 'gitnexus://repos'
npx gitnexus read 'gitnexus://setup'
npx gitnexus read 'gitnexus://repo/<repo>/context'
```

### Workflow

1. Run `npx gitnexus status`.
2. If no index or stale index, run `npx gitnexus analyze`.
3. Run `npx gitnexus list` to identify repo name when needed.
4. Run `npx gitnexus read 'gitnexus://repo/<repo>/context'` to verify stats/staleness.
5. Continue to task-specific skill.

### Important Rules

- Prefer `npx gitnexus analyze` from repo root.
- Use `--force` only for corrupt or intentionally rebuilt index.
- Use `--embeddings` when semantic search quality matters and time/resources allow it.
- Use `clean --force` only when explicitly intended; deleting indexes is reversible by re-analyzing but may be expensive.

---

## 10. Skill 2: `gitnexus-explore`

### Purpose

Use for architecture understanding, unfamiliar code exploration, execution flow tracing, and answering “how does X work?”.

### MCP Coverage

- `query`
- `context`
- resources:
  - `repo/context`
  - `repo/clusters`
  - `repo/cluster/{name}`
  - `repo/processes`
  - `repo/process/{name}`

### Commands

Ergonomic commands:

```bash
npx gitnexus query "authentication flow" --repo <repo> --limit 5
npx gitnexus query "payment processing" --context "adding refund support" --goal "find existing payment validation"
npx gitnexus context "AuthService" --repo <repo>
npx gitnexus context "validateUser" --file src/auth/validate.ts --content
npx gitnexus read 'gitnexus://repo/<repo>/clusters'
npx gitnexus read 'gitnexus://repo/<repo>/cluster/<clusterName>'
npx gitnexus read 'gitnexus://repo/<repo>/processes'
npx gitnexus read 'gitnexus://repo/<repo>/process/<processName>'
```

Universal equivalents:

```bash
npx gitnexus call query --json '{"query":"authentication flow","repo":"my-app","limit":5}'
npx gitnexus call context --json '{"name":"AuthService","repo":"my-app","include_content":true}'
```

### Workflow

1. Check repo context:

   ```bash
   npx gitnexus read 'gitnexus://repo/<repo>/context'
   ```

2. Search for the concept:

   ```bash
   npx gitnexus query "<concept>" --repo <repo>
   ```

3. Pick key symbols/processes from results.
4. Deep dive on symbols:

   ```bash
   npx gitnexus context "<symbol>" --repo <repo>
   ```

5. Trace full process when available:

   ```bash
   npx gitnexus read 'gitnexus://repo/<repo>/process/<processName>'
   ```

6. Read source files for final confirmation.

### Output Guidance

Summaries should include:

- Main files/symbols.
- Execution flow overview.
- Important callers/callees.
- Any uncertainty or missing index/stale warnings.

---

## 11. Skill 3: `gitnexus-debug`

### Purpose

Use for tracing errors, bugs, unexpected behavior, and root-cause analysis.

### MCP Coverage

- `query`
- `context`
- `cypher`
- `detect_changes`
- process resources

### Commands

```bash
npx gitnexus query "<error text or symptom>"
npx gitnexus query "<feature area> error handling"
npx gitnexus context "<suspectSymbol>" --content
npx gitnexus read 'gitnexus://repo/<repo>/process/<processName>'
npx gitnexus cypher '<custom Cypher query>'
npx gitnexus detect-changes --scope all
```

### Workflow

1. Identify symptom/error text.
2. Search graph for related flows:

   ```bash
   npx gitnexus query "<symptom>"
   ```

3. Use `context` on likely suspect symbols.
4. Trace process resources for call sequence.
5. Use `cypher` only when standard query/context is not enough.
6. Read code and confirm root cause.
7. If recent local edits may be involved, run:

   ```bash
   npx gitnexus detect-changes --scope all
   ```

### Common Cypher Patterns

Call chain into a function:

```cypher
MATCH path = (a)-[:CodeRelation {type: 'CALLS'}*1..3]->(b {name: "targetName"})
RETURN [n IN nodes(path) | n.name] AS chain
LIMIT 20
```

Find direct callers:

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(target {name: "targetName"})
RETURN caller.name, caller.filePath
```

Find throw/error symbols by name pattern if indexed:

```cypher
MATCH (n)
WHERE n.name CONTAINS "Error" OR n.name CONTAINS "Exception"
RETURN labels(n), n.name, n.filePath
LIMIT 50
```

---

## 12. Skill 4: `gitnexus-impact`

### Purpose

Use before changing shared code to understand blast radius and risk.

### MCP Coverage

- `impact`
- `detect_changes`
- process resources

### Commands

```bash
npx gitnexus impact "<symbol>" --direction upstream --depth 3
npx gitnexus impact "<symbol>" --direction downstream --depth 2
npx gitnexus impact "<symbol>" --direction upstream --include-tests
npx gitnexus detect-changes --scope unstaged
npx gitnexus detect-changes --scope staged
npx gitnexus detect-changes --scope compare --base-ref main
```

Advanced:

```bash
npx gitnexus call impact --json '{
  "target":"AuthService",
  "direction":"upstream",
  "maxDepth":3,
  "includeTests":true,
  "minConfidence":0.8,
  "relationTypes":["CALLS","IMPORTS","EXTENDS","IMPLEMENTS","ACCESSES"]
}'
```

### Workflow

1. Run upstream impact for symbol being changed.
2. Review d=1/direct callers first.
3. Review affected processes/modules.
4. If tests matter, rerun with `--include-tests` or advanced JSON.
5. After edits, run `detect-changes`.
6. Report risk.

### Risk Heuristics

| Signal | Risk |
|---|---|
| 0-4 affected symbols, no critical flow | LOW |
| 5-15 symbols or 2-5 processes | MEDIUM |
| >15 symbols or many modules/processes | HIGH |
| Auth/payment/security/data integrity | CRITICAL |
| d=1 callers outside intended change area | Potential breakage |

---

## 13. Skill 5: `gitnexus-refactor`

### Purpose

Use for safe rename/extract/split/move/restructure tasks.

### MCP Coverage

- `rename`
- `impact`
- `context`
- `query`
- `detect_changes`

### Commands

Rename dry-run:

```bash
npx gitnexus call rename --json '{
  "symbol_name":"oldName",
  "new_name":"newName",
  "dry_run":true
}'
```

Rename apply:

```bash
npx gitnexus call rename --json '{
  "symbol_name":"oldName",
  "new_name":"newName",
  "dry_run":false
}'
```

Supporting analysis:

```bash
npx gitnexus context "oldName"
npx gitnexus impact "oldName" --direction upstream
npx gitnexus query "oldName usage"
npx gitnexus detect-changes --scope all
```

### Workflow: Rename

1. Run `context` to understand symbol.
2. Run `impact` upstream.
3. Run `rename` with `dry_run:true`.
4. Review high-confidence graph edits and lower-confidence text edits.
5. Apply with `dry_run:false` only when safe.
6. Run `detect-changes --scope all`.
7. Run project tests/lint appropriate to affected files.

### Workflow: Extract/Split/Move

1. Run `context` for target symbol/class/module.
2. Run `impact` upstream for external callers.
3. Run `query` for related flows.
4. Plan interface boundaries.
5. Edit source files.
6. Run `detect-changes`.
7. Re-run `impact` on moved/extracted public symbols.
8. Run tests/lint.

### Safety Rules

- Never apply rename without dry-run review.
- For public API symbols, prefer compatibility/deprecation over direct breaking rename.
- For dynamic/string references, supplement graph with text search/source inspection.

---

## 14. Skill 6: `gitnexus-pr-review`

### Purpose

Use to review pull requests or local branches with graph-based impact/risk context.

### MCP Coverage

- `detect_changes`
- `impact`
- `context`
- `query`

### Commands

```bash
git diff main...HEAD
npx gitnexus detect-changes --scope compare --base-ref main
npx gitnexus impact "<changedSymbol>" --direction upstream --include-tests
npx gitnexus context "<changedSymbol>"
npx gitnexus query "<changed area>"
```

With GitHub CLI, if available:

```bash
gh pr diff <number>
gh pr view <number> --json title,author,baseRefName,headRefName,files
```

### Workflow

1. Inspect diff.
2. Run `detect-changes --scope compare --base-ref <base>`.
3. For each non-trivial changed symbol, run upstream impact.
4. For public API/route changes, hand off to `gitnexus-api-impact` skill.
5. Check tests via impact with `--include-tests` and repository test files.
6. Produce review summary.

### Review Output Format

```markdown
## PR Review: <title or branch>

Risk: LOW/MEDIUM/HIGH/CRITICAL

### Change Summary
- N symbols changed across M files
- P execution flows affected

### Findings
- [severity] Finding with evidence

### Missing Coverage
- Untested flows/callers

### Recommendation
APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
```

---

## 15. Skill 7: `gitnexus-api-impact`

### Purpose

Use before changing API route handlers, response shapes, endpoint paths, or API consumers.

### MCP Coverage

- `route_map`
- `shape_check`
- `api_impact`
- optionally `impact`, `context`

### Commands

```bash
npx gitnexus call route_map --json '{"route":"/api/users","repo":"my-app"}'
npx gitnexus call route_map --json '{"repo":"my-app"}'
npx gitnexus call shape_check --json '{"route":"/api/users","repo":"my-app"}'
npx gitnexus call api_impact --json '{"route":"/api/users","repo":"my-app"}'
npx gitnexus call api_impact --json '{"file":"src/app/api/users/route.ts","repo":"my-app"}'
```

### Workflow

1. Identify route path or handler file.
2. Run `api_impact` first because it combines route map, shape check, and impact.
3. If results are broad, run `route_map` to inspect handlers/consumers.
4. Run `shape_check` to inspect response shape mismatch.
5. For handler symbols, run `impact` if deeper graph blast radius is needed.
6. Report consumers, expected response keys, mismatches, middleware, and risk.

### Risk Heuristics

| Signal | Risk |
|---|---|
| 0-3 consumers, no mismatch | LOW |
| 4-9 consumers or low-confidence attribution | MEDIUM |
| 10+ consumers or mismatch | HIGH |
| Auth/security/payment/data route | CRITICAL |

---

## 16. Skill 8: `gitnexus-tool-map`

### Purpose

Use to understand MCP/RPC/internal tool definitions in a target codebase, including where tools are defined and handled.

### MCP Coverage

- `tool_map`
- `context`
- `impact`

### Commands

```bash
npx gitnexus call tool_map --json '{"repo":"my-app"}'
npx gitnexus call tool_map --json '{"tool":"searchUsers","repo":"my-app"}'
npx gitnexus context "searchUsers" --repo my-app
npx gitnexus impact "searchUsers" --direction upstream --repo my-app
```

### Workflow

1. Run all-tool map for overview.
2. Filter specific tool if user asks about one tool.
3. Run `context` on handler symbol.
4. Run `impact` before changing tool schema/signature.
5. Read source files to confirm implementation details.

### Typical Questions

- “Where is tool X implemented?”
- “What tools does this server expose?”
- “If I change tool X payload, what breaks?”
- “Are tool definitions and handlers colocated?”

---

## 17. Skill 9: `gitnexus-cypher`

### Purpose

Use for advanced graph queries when `query`, `context`, and `impact` are insufficient.

### MCP Coverage

- `cypher`
- `gitnexus://repo/{name}/schema`

### Commands

```bash
npx gitnexus read 'gitnexus://repo/<repo>/schema'
npx gitnexus cypher 'MATCH (n:Function) RETURN n.name, n.filePath LIMIT 20'
npx gitnexus call cypher --json '{"query":"MATCH (n) RETURN labels(n), count(*)","repo":"my-app"}'
```

### Workflow

1. Always read schema first for unfamiliar repo/index version.
2. Prefer read-only Cypher queries.
3. Keep result limits small initially.
4. Use returned symbols with `context` or source inspection.

### Common Query Templates

Find callers:

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(target {name: "targetName"})
RETURN caller.name, caller.filePath
LIMIT 50
```

Find methods of class:

```cypher
MATCH (c:Class {name: "ClassName"})-[:CodeRelation {type: 'HAS_METHOD'}]->(m:Method)
RETURN m.name, m.filePath, m.startLine
ORDER BY m.name
```

Find process steps:

```cypher
MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
WHERE p.heuristicLabel = "ProcessName"
RETURN s.name, s.filePath, r.step
ORDER BY r.step
```

Find route handlers:

```cypher
MATCH (h)-[:CodeRelation {type: 'HANDLES_ROUTE'}]->(r:Route)
RETURN r.path, h.name, h.filePath
LIMIT 100
```

---

## 18. Skill 10: `gitnexus-group`

### Purpose

Use for multi-repo/group workflows, cross-repo service tracking, contract registries, and cross-boundary impact.

### MCP Coverage

- `group_list`
- `group_sync`
- group-mode `query`, `context`, `impact`
- resources:
  - `gitnexus://group/{name}/contracts`
  - `gitnexus://group/{name}/status`

### Commands

```bash
npx gitnexus group create <name>
npx gitnexus group add <group> <groupPath> <registryName>
npx gitnexus group remove <group> <groupPath>
npx gitnexus group list
npx gitnexus group list <name>
npx gitnexus group status <name>
npx gitnexus group sync <name> --json
npx gitnexus group contracts <name> --json
npx gitnexus group contracts <name> --type http --json
npx gitnexus group contracts <name> --unmatched --json
npx gitnexus group query <name> "auth flow" --json
npx gitnexus group impact <name> --target AuthService --repo backend --direction upstream --json
npx gitnexus read 'gitnexus://group/<name>/contracts'
npx gitnexus read 'gitnexus://group/<name>/status'
```

Universal group-mode alternatives:

```bash
npx gitnexus call query --json '{"repo":"@platform","query":"auth flow"}'
npx gitnexus call impact --json '{"repo":"@platform/backend","target":"AuthService","direction":"upstream"}'
npx gitnexus call context --json '{"repo":"@platform/backend","name":"AuthService"}'
```

### Workflow

1. List repos:

   ```bash
   npx gitnexus list
   ```

2. Create group if absent:

   ```bash
   npx gitnexus group create platform
   ```

3. Add indexed repos by registry name:

   ```bash
   npx gitnexus group add platform backend my-backend-repo
   npx gitnexus group add platform frontend my-frontend-repo
   ```

4. Sync contracts:

   ```bash
   npx gitnexus group sync platform --json
   ```

5. Check status/contracts:

   ```bash
   npx gitnexus group status platform
   npx gitnexus group contracts platform --json
   ```

6. Run group query/impact.

### Safety Rules

- Run `group status` before relying on contracts.
- Run `group sync` after re-indexing member repos or editing `group.yaml`.
- Treat unmatched contracts as blind spots in impact analysis.

---

## 19. MCP-to-Skill Mapping Matrix

| MCP Tool/Resource | Primary Skill | Replacement Command |
|---|---|---|
| `list_repos` | `gitnexus-cli` | `npx gitnexus list` or `npx gitnexus call list_repos --json '{}'` |
| `query` | `gitnexus-explore` | `npx gitnexus query "..."` or `npx gitnexus call query --json '{...}'` |
| `context` | `gitnexus-explore` | `npx gitnexus context "..."` or `npx gitnexus call context --json '{...}'` |
| `impact` | `gitnexus-impact` | `npx gitnexus impact "..." --direction upstream` |
| `detect_changes` | `gitnexus-impact` / `gitnexus-pr-review` | `npx gitnexus detect-changes --scope staged` |
| `cypher` | `gitnexus-cypher` | `npx gitnexus cypher '<query>'` |
| `rename` | `gitnexus-refactor` | `npx gitnexus call rename --json '{...}'` |
| `route_map` | `gitnexus-api-impact` | `npx gitnexus call route_map --json '{...}'` |
| `shape_check` | `gitnexus-api-impact` | `npx gitnexus call shape_check --json '{...}'` |
| `api_impact` | `gitnexus-api-impact` | `npx gitnexus call api_impact --json '{...}'` |
| `tool_map` | `gitnexus-tool-map` | `npx gitnexus call tool_map --json '{...}'` |
| `group_list` | `gitnexus-group` | `npx gitnexus group list` |
| `group_sync` | `gitnexus-group` | `npx gitnexus group sync <name> --json` |
| `gitnexus://repos` | `gitnexus-cli` | `npx gitnexus read 'gitnexus://repos'` |
| `gitnexus://setup` | `gitnexus-cli` | `npx gitnexus read 'gitnexus://setup'` |
| `gitnexus://repo/{name}/context` | `gitnexus-cli` / all skills | `npx gitnexus read 'gitnexus://repo/<repo>/context'` |
| `gitnexus://repo/{name}/clusters` | `gitnexus-explore` | `npx gitnexus read 'gitnexus://repo/<repo>/clusters'` |
| `gitnexus://repo/{name}/cluster/{cluster}` | `gitnexus-explore` | `npx gitnexus read 'gitnexus://repo/<repo>/cluster/<cluster>'` |
| `gitnexus://repo/{name}/processes` | `gitnexus-explore` / `gitnexus-debug` | `npx gitnexus read 'gitnexus://repo/<repo>/processes'` |
| `gitnexus://repo/{name}/process/{process}` | `gitnexus-explore` / `gitnexus-debug` | `npx gitnexus read 'gitnexus://repo/<repo>/process/<process>'` |
| `gitnexus://repo/{name}/schema` | `gitnexus-cypher` | `npx gitnexus read 'gitnexus://repo/<repo>/schema'` |
| `gitnexus://group/{name}/contracts` | `gitnexus-group` | `npx gitnexus read 'gitnexus://group/<group>/contracts'` |
| `gitnexus://group/{name}/status` | `gitnexus-group` | `npx gitnexus read 'gitnexus://group/<group>/status'` |

---

## 20. Phase 5: Rewrite Existing Skill Files

Existing files:

```text
gitnexus/skills/gitnexus-cli.md
gitnexus/skills/gitnexus-debugging.md
gitnexus/skills/gitnexus-exploring.md
gitnexus/skills/gitnexus-guide.md
gitnexus/skills/gitnexus-impact-analysis.md
gitnexus/skills/gitnexus-pr-review.md
gitnexus/skills/gitnexus-refactoring.md
```

### 20.1 Required Changes

Replace MCP-style examples:

```text
READ gitnexus://repo/{name}/context
gitnexus_query({query: "..."})
gitnexus_context({name: "..."})
gitnexus_impact({target: "..."})
gitnexus_detect_changes(...)
```

With command examples:

```bash
npx gitnexus read 'gitnexus://repo/<repo>/context'
npx gitnexus query "..."
npx gitnexus context "..."
npx gitnexus impact "..." --direction upstream
npx gitnexus detect-changes --scope staged
npx gitnexus call <tool> --json '{...}'
```

### 20.2 Add New Skill Files

Add:

```text
gitnexus/skills/gitnexus-api-impact.md
gitnexus/skills/gitnexus-tool-map.md
gitnexus/skills/gitnexus-group.md
```

Optional add:

```text
gitnexus/skills/gitnexus-cypher.md
```

Or fold Cypher into `gitnexus-guide.md` if minimizing skill count is preferred. Recommendation: keep `gitnexus-cypher` separate because advanced graph query workflows are specialized and can bloat general guide context.

### 20.3 Keep Existing Skill Names or Rename?

Current names:

- `gitnexus-exploring`
- `gitnexus-impact-analysis`
- `gitnexus-refactoring`
- `gitnexus-debugging`

Plan names suggested shorter names, but for backward compatibility, prefer updating existing names in place:

| Plan Name | Existing Compatible File |
|---|---|
| `gitnexus-explore` | `gitnexus-exploring.md` |
| `gitnexus-debug` | `gitnexus-debugging.md` |
| `gitnexus-impact` | `gitnexus-impact-analysis.md` |
| `gitnexus-refactor` | `gitnexus-refactoring.md` |

Recommendation:

- Keep existing filenames to avoid breaking tests/installers.
- Add new files for new capabilities.
- Consider aliases later only if skill packaging supports aliases.

---

## 21. Phase 6: Update Generated Context and Skill Generation

### 21.1 Update AGENTS/CLAUDE Generation

Find generation code, likely around:

```text
gitnexus/src/cli/ai-context.ts
```

Update generated guidance:

- Say GitNexus can be used via CLI commands without MCP.
- Prefer command examples.
- MCP should be optional, not required.
- Include minimal quick reference:

```bash
npx gitnexus status
npx gitnexus query "..."
npx gitnexus context "..."
npx gitnexus impact "..." --direction upstream
npx gitnexus detect-changes --scope staged
npx gitnexus call <tool> --json '{...}'
npx gitnexus read 'gitnexus://repo/<repo>/context'
```

### 21.2 Update Generated Skills

Find:

```text
gitnexus/src/cli/skill-gen.ts
```

Current generated skills may mention MCP-style resources/tools. Update render function so generated community skills use CLI commands.

Generated skill should say:

```bash
npx gitnexus query "<community label>"
npx gitnexus context "<symbol>"
npx gitnexus read 'gitnexus://repo/<repo>/cluster/<clusterName>'
```

### 21.3 Update Tests

Likely tests:

```text
gitnexus/test/unit/skill-gen.test.ts
gitnexus/test/integration/skills-e2e.test.ts
gitnexus/test/unit/setup-codex.test.ts
gitnexus/test/unit/setup.test.ts
gitnexus/test/integration/setup-skills.test.ts
```

Adjust expected content snapshots/strings from MCP-style to CLI-style.

---

## 22. Phase 7: Tests and Validation

### 22.1 Unit Tests for `call`

Add tests, likely new file:

```text
gitnexus/test/unit/call-cli.test.ts
```

Test cases:

1. Invalid JSON exits non-zero and prints helpful error.
2. Empty payload defaults to `{}`.
3. `call list_repos --json '{}'` returns indexed repo list in test fixture.
4. Unknown tool returns useful error.
5. `--repo` merges repo into payload only when payload lacks `repo`.

### 22.2 Unit Tests for `read`

Add tests:

```text
gitnexus/test/unit/read-resource-cli.test.ts
```

Test cases:

1. `read gitnexus://repos` returns repos content.
2. `read gitnexus://repo/<repo>/schema` returns schema.
3. Invalid URI exits non-zero.
4. Group resource URI parses and dispatches if fixture available.

### 22.3 Integration Tests

Update/add:

```text
gitnexus/test/integration/cli-e2e.test.ts
gitnexus/test/integration/local-backend-calltool.test.ts
gitnexus/test/integration/skills-e2e.test.ts
```

Key integration checks:

```bash
npx gitnexus analyze <fixture>
npx gitnexus call query --json '{"query":"..."}'
npx gitnexus call api_impact --json '{"route":"..."}'
npx gitnexus read 'gitnexus://repos'
npx gitnexus read 'gitnexus://repo/<repo>/context'
```

### 22.4 Manual Smoke Test

From a real repo:

```bash
cd <some-repo>
npx gitnexus analyze
npx gitnexus status
npx gitnexus list
npx gitnexus read 'gitnexus://repos'
npx gitnexus query "auth flow"
npx gitnexus context "AuthService"
npx gitnexus impact "AuthService" --direction upstream
npx gitnexus detect-changes --scope all
npx gitnexus call route_map --json '{}'
npx gitnexus call shape_check --json '{}'
npx gitnexus call tool_map --json '{}'
```

### 22.5 Build/Test Gate

Run:

```bash
cd gitnexus
npm run build
npm test -- --run test/unit/tool-direct-cli.test.ts
npm test -- --run test/unit/resources.test.ts
npm test -- --run test/unit/skill-gen.test.ts
npm test -- --run test/integration/skills-e2e.test.ts
npm test -- --run test/integration/cli-e2e.test.ts
```

From repo root:

```bash
npm run lint
npm run format:check
```

Adjust exact commands if current test runner syntax differs.

---

## 23. Documentation Updates

Update these docs:

```text
README.md
gitnexus/README.md
ARCHITECTURE.md
RUNBOOK.md
```

### 23.1 README Updates

Add section:

```markdown
## Using GitNexus Without MCP

If MCP is unavailable or not allowed, use the CLI-driven skills:

```bash
npx gitnexus analyze
npx gitnexus query "auth flow"
npx gitnexus context "AuthService"
npx gitnexus impact "AuthService" --direction upstream
npx gitnexus call api_impact --json '{"route":"/api/users"}'
npx gitnexus read 'gitnexus://repo/my-app/context'
```
```

### 23.2 Architecture Update

Update query layer section:

Current:

- MCP stdio
- HTTP bridge
- CLI direct

Add:

- CLI universal tool/resource bridge:
  - `gitnexus call <tool> --json ...`
  - `gitnexus read <resource-uri>`

### 23.3 Runbook Update

Add troubleshooting:

- If MCP blocked by company policy, use CLI command workflows.
- If `call` says no indexed repos, run `npx gitnexus analyze`.
- If `read repo context` warns stale, re-run analyze.

---

## 24. Backward Compatibility

### 24.1 MCP Should Continue Working

Do not remove or degrade:

```bash
gitnexus mcp
```

Existing MCP users should remain unaffected.

### 24.2 Existing CLI Commands Should Continue Working

Do not replace ergonomic commands with only universal `call`. Keep:

```bash
gitnexus query
gitnexus context
gitnexus impact
gitnexus cypher
gitnexus detect-changes
```

`call` is additive.

### 24.3 Existing Skills Should Remain Discoverable

Keep current skill files and names unless there is a migration mechanism.

---

## 25. Security and Corporate Environment Considerations

### 25.1 No MCP Server Required

Skills should not require:

```bash
gitnexus mcp
```

### 25.2 No Local HTTP Server Required

Skills should not require:

```bash
gitnexus serve
```

unless the task is explicitly about Web UI.

### 25.3 Local-Only Default

The command workflows should remain local-only except:

- `wiki` may call external LLM provider depending on config.
- `analyze --embeddings` may use remote embeddings if env vars configure it.

Skills should warn before using commands that may call external providers.

### 25.4 Destructive Operations

`rename` can modify files when `dry_run:false`.

Skill rule:

- Always run dry-run first.
- Review output.
- Apply only after user/agent has enough confidence.

`clean`, `remove`, and `clean --all` delete indexes. They do not delete source code, but can be expensive to rebuild. Treat as intentional maintenance operations.

---

## 26. Proposed Implementation Order

1. Add `gitnexus call` command.
2. Add `gitnexus read` command.
3. Add unit/integration tests for both.
4. Manually smoke-test against an indexed repo.
5. Update existing skills to command-only.
6. Add new skills:
   - `gitnexus-api-impact.md`
   - `gitnexus-tool-map.md`
   - `gitnexus-group.md`
   - optionally `gitnexus-cypher.md`
7. Update generated AGENTS/CLAUDE context.
8. Update skill generator output.
9. Update README/ARCHITECTURE/RUNBOOK.
10. Run full build/test/lint gates.

---

## 27. Definition of Done

Implementation is done when:

- [ ] `npx gitnexus call list_repos --json '{}'` works without MCP.
- [ ] `npx gitnexus call query --json '{"query":"..."}'` works without MCP.
- [ ] `npx gitnexus call rename --json '{"symbol_name":"...","new_name":"...","dry_run":true}'` works without MCP.
- [ ] `npx gitnexus call api_impact --json '{...}'` works without MCP.
- [ ] `npx gitnexus read 'gitnexus://repos'` works without MCP.
- [ ] `npx gitnexus read 'gitnexus://repo/<repo>/context'` works without MCP.
- [ ] Existing direct commands still work.
- [ ] Existing MCP server still works.
- [ ] Existing skills no longer require MCP-style calls.
- [ ] New API/tool/group skills exist.
- [ ] Generated skills/context use command examples.
- [ ] README documents non-MCP usage.
- [ ] Tests/build/lint pass.

---

## 28. Open Questions for Future Implementer

1. Should `gitnexus read` be named `read`, `resource`, or `get`?
   - Recommendation: `read`.

2. Should `gitnexus call` default output be pretty JSON or compact JSON?
   - Recommendation: pretty JSON for human/agent readability.

3. Should `{ error: ... }` tool results cause non-zero exit?
   - Recommendation: preserve backend semantics initially; only thrown errors exit non-zero.

4. Should direct ergonomic commands be added for `api-impact`, `route-map`, `shape-check`, `tool-map`, `rename`?
   - Recommendation: optional Phase 8; universal `call` is enough for skill replacement.

5. Should skills be converted from `gitnexus/skills/*.md` to folder-based AgentSkill packages?
   - Recommendation: update existing `.md` first, then package later if target agent runtime requires folder-based skills.

---

## 29. Quick Reference for Future Skill Authors

Use these patterns in skills:

```bash
# Check index
npx gitnexus status
npx gitnexus read 'gitnexus://repo/<repo>/context'

# Explore
npx gitnexus query "<concept>" --repo <repo>
npx gitnexus context "<symbol>" --repo <repo>

# Impact
npx gitnexus impact "<symbol>" --direction upstream --repo <repo>
npx gitnexus detect-changes --scope staged --repo <repo>

# Universal tools
npx gitnexus call <tool> --json '{"repo":"<repo>"}'

# Resources
npx gitnexus read 'gitnexus://repo/<repo>/schema'
npx gitnexus read 'gitnexus://repo/<repo>/processes'

# API-specific
npx gitnexus call api_impact --json '{"route":"/api/users","repo":"<repo>"}'

# Group-specific
npx gitnexus group status <group>
npx gitnexus group sync <group> --json
npx gitnexus group impact <group> --target <symbol> --repo <groupPath> --direction upstream --json
```

Skills should always:

- Check index freshness before relying on graph results.
- Prefer direct ergonomic commands when available.
- Use `gitnexus call` for tools without direct CLI.
- Use `gitnexus read` for resources.
- Read source files after graph results before making final claims.
- Run tests/lint/build after code changes when possible.

---

## 30. Cline-Specific Skill Packaging Plan

Anh Lực is using Cline. Cline does not consume AgentSkills in exactly the same way as Claude/OpenClaw folder-based skills. Therefore the non-MCP GitNexus skill set should be prepared in a Cline-friendly format first.

Cline-friendly means:

- Plain Markdown files.
- Short enough for Cline to read quickly.
- Clear trigger phrases.
- Explicit shell commands Cline can run.
- No MCP assumptions.
- No `gitnexus_query(...)` pseudo-tool syntax.
- Prefer copy/paste-ready commands.
- Include safety rules before destructive commands.
- Include expected output interpretation.

### 30.1 Recommended Cline Skill Location

Use a dedicated folder in the repo:

```text
.cline/
  rules/
    gitnexus.md
  skills/
    gitnexus-cli.md
    gitnexus-exploring.md
    gitnexus-debugging.md
    gitnexus-impact-analysis.md
    gitnexus-refactoring.md
    gitnexus-pr-review.md
    gitnexus-api-impact.md
    gitnexus-tool-map.md
    gitnexus-cypher.md
    gitnexus-group.md
```

Alternative if the project wants to avoid `.cline/skills`:

```text
gitnexus/skills/cline/
  gitnexus-cli.md
  gitnexus-exploring.md
  ...
```

Recommendation: create both if useful:

- Source of truth: `gitnexus/skills/cline/*.md`
- Cline entrypoint/rule: `.cline/rules/gitnexus.md` links to the relevant skill files.

### 30.2 Main Cline Rule File

Create:

```text
.cline/rules/gitnexus.md
```

Purpose: teach Cline how to decide which GitNexus skill file to read.

Suggested content:

```markdown
# GitNexus Non-MCP Code Intelligence Rules for Cline

Use GitNexus CLI commands for code intelligence. Do not use MCP.

Before code-understanding, debugging, impact analysis, PR review, or refactoring tasks:

1. Run or inspect:

   ```bash
   npx gitnexus status
   ```

2. If no index or stale index, run:

   ```bash
   npx gitnexus analyze
   ```

3. Select the relevant skill:

| Task | Read |
|---|---|
| Setup/index/status/list/wiki | `.cline/skills/gitnexus-cli.md` |
| Understand architecture/how X works | `.cline/skills/gitnexus-exploring.md` |
| Debug bug/error/failure | `.cline/skills/gitnexus-debugging.md` |
| What breaks if X changes | `.cline/skills/gitnexus-impact-analysis.md` |
| Rename/extract/split/move/refactor | `.cline/skills/gitnexus-refactoring.md` |
| PR/diff review | `.cline/skills/gitnexus-pr-review.md` |
| API route/consumer/shape analysis | `.cline/skills/gitnexus-api-impact.md` |
| MCP/RPC/internal tool definitions | `.cline/skills/gitnexus-tool-map.md` |
| Advanced graph queries | `.cline/skills/gitnexus-cypher.md` |
| Multi-repo/group analysis | `.cline/skills/gitnexus-group.md` |

Prefer direct commands:

```bash
npx gitnexus query "..."
npx gitnexus context "..."
npx gitnexus impact "..." --direction upstream
npx gitnexus detect-changes --scope staged
```

Use universal commands for tools/resources without direct CLI:

```bash
npx gitnexus call <tool> --json '{...}'
npx gitnexus read 'gitnexus://repo/<repo>/context'
```

Always read source files after graph results before making final claims.
```

### 30.3 Cline Skill File Structure

Each Cline skill should use this structure:

```markdown
# GitNexus: <Skill Name>

## Use When

- Trigger phrase 1
- Trigger phrase 2
- Trigger phrase 3

## First Check

```bash
npx gitnexus status
```

If stale/missing:

```bash
npx gitnexus analyze
```

## Commands

Core commands for this skill.

## Workflow

1. Step one.
2. Step two.
3. Step three.

## How to Interpret Output

- What field/section matters.
- What warnings mean.
- What to do next.

## Safety Rules

- Destructive caveats.
- Stale index caveats.
- External network caveats if any.

## Example

User asks: "..."

Run:

```bash
...
```

Then answer with:

- Summary
- Evidence
- Next action
```

Important Cline-specific rules:

- Keep each skill focused.
- Avoid huge theory sections.
- Prefer exact commands over abstract API descriptions.
- Include placeholders like `<repo>`, `<symbol>`, `<route>` consistently.
- Put destructive commands after dry-run commands.
- Do not ask Cline to call MCP tools or read MCP resources directly. Use `npx gitnexus read`.

### 30.4 Cline Skill: `gitnexus-cli.md`

Path:

```text
.cline/skills/gitnexus-cli.md
```

Purpose: indexing, listing, status, doctor, cleaning, wiki.

Required content outline:

```markdown
# GitNexus: CLI Operations

## Use When

- User asks to index/reindex a repo.
- User asks whether GitNexus is ready.
- User asks to list indexed repos.
- User asks to generate docs/wiki.
- GitNexus commands say no indexed repos or stale index.

## Commands

```bash
npx gitnexus status
npx gitnexus analyze
npx gitnexus analyze --force
npx gitnexus analyze --embeddings
npx gitnexus analyze --skills
npx gitnexus list
npx gitnexus doctor
npx gitnexus read 'gitnexus://repos'
npx gitnexus read 'gitnexus://repo/<repo>/context'
npx gitnexus wiki
```

## Workflow

1. Run `npx gitnexus status` from repo root.
2. If missing/stale, run `npx gitnexus analyze`.
3. Run `npx gitnexus list` to find repo name if needed.
4. Run `npx gitnexus read 'gitnexus://repo/<repo>/context'` to verify.

## Safety Rules

- Use `--force` only if a full rebuild is required.
- Do not run `clean --all --force` unless explicitly requested.
- Wiki generation may use configured LLM provider; check before external calls in restricted environments.
```

### 30.5 Cline Skill: `gitnexus-exploring.md`

Purpose: understand code, architecture, execution flows.

Required commands:

```bash
npx gitnexus query "<concept>" --repo <repo> --limit 5
npx gitnexus context "<symbol>" --repo <repo>
npx gitnexus context "<symbol>" --repo <repo> --content
npx gitnexus read 'gitnexus://repo/<repo>/clusters'
npx gitnexus read 'gitnexus://repo/<repo>/processes'
npx gitnexus read 'gitnexus://repo/<repo>/process/<processName>'
```

Cline workflow:

1. Check index.
2. Query broad concept.
3. Context key symbols.
4. Read process/cluster resource if needed.
5. Read actual source files.
6. Answer with architecture summary and evidence.

### 30.6 Cline Skill: `gitnexus-debugging.md`

Purpose: trace bug/error/root cause.

Required commands:

```bash
npx gitnexus query "<error text or symptom>"
npx gitnexus context "<suspectSymbol>" --content
npx gitnexus read 'gitnexus://repo/<repo>/process/<processName>'
npx gitnexus cypher '<query>'
npx gitnexus detect-changes --scope all
```

Cline workflow:

1. Search symptom/error.
2. Pick suspect symbols.
3. Get symbol context.
4. Trace process.
5. Read source files.
6. Form root-cause hypothesis.
7. Validate with tests or targeted inspection.

### 30.7 Cline Skill: `gitnexus-impact-analysis.md`

Purpose: answer “what breaks if X changes?”.

Required commands:

```bash
npx gitnexus impact "<symbol>" --direction upstream --depth 3
npx gitnexus impact "<symbol>" --direction downstream --depth 2
npx gitnexus impact "<symbol>" --direction upstream --include-tests
npx gitnexus detect-changes --scope staged
npx gitnexus detect-changes --scope all
npx gitnexus call impact --json '{"target":"<symbol>","direction":"upstream","maxDepth":3,"includeTests":true}'
```

Cline output format:

```markdown
Risk: LOW/MEDIUM/HIGH/CRITICAL

Direct dependents:
- ...

Affected flows:
- ...

Tests to run:
- ...

Notes:
- stale index/dynamic refs/uncertainty
```

### 30.8 Cline Skill: `gitnexus-refactoring.md`

Purpose: rename/extract/split/move safely.

Required commands:

```bash
npx gitnexus context "<symbol>"
npx gitnexus impact "<symbol>" --direction upstream
npx gitnexus call rename --json '{"symbol_name":"<old>","new_name":"<new>","dry_run":true}'
npx gitnexus call rename --json '{"symbol_name":"<old>","new_name":"<new>","dry_run":false}'
npx gitnexus detect-changes --scope all
```

Cline safety requirement:

- Always run `dry_run:true` first.
- Review edits before `dry_run:false`.
- If generated edits include low-confidence text matches, inspect files manually.
- After applying, run `detect-changes` and relevant tests.

### 30.9 Cline Skill: `gitnexus-pr-review.md`

Purpose: PR/diff review.

Required commands:

```bash
git diff main...HEAD
npx gitnexus detect-changes --scope compare --base-ref main
npx gitnexus impact "<changedSymbol>" --direction upstream --include-tests
npx gitnexus context "<changedSymbol>"
```

If GitHub CLI exists:

```bash
gh pr diff <number>
gh pr view <number> --json title,author,baseRefName,headRefName,files
```

Cline output format:

```markdown
## PR Review

Risk: LOW/MEDIUM/HIGH/CRITICAL

### Summary
- ...

### Findings
- [severity] ...

### Missing Coverage
- ...

### Recommendation
APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
```

### 30.10 Cline Skill: `gitnexus-api-impact.md`

Purpose: API route/consumer/shape analysis.

Required commands:

```bash
npx gitnexus call api_impact --json '{"route":"<route>","repo":"<repo>"}'
npx gitnexus call api_impact --json '{"file":"<handlerFile>","repo":"<repo>"}'
npx gitnexus call route_map --json '{"route":"<route>","repo":"<repo>"}'
npx gitnexus call shape_check --json '{"route":"<route>","repo":"<repo>"}'
```

Cline workflow:

1. Prefer `api_impact` first.
2. Use `route_map` for handler/consumer details.
3. Use `shape_check` for response shape drift.
4. Read handler and consumer files.
5. Report risk and affected consumers.

### 30.11 Cline Skill: `gitnexus-tool-map.md`

Purpose: inspect tool definitions/handlers inside indexed codebases.

Required commands:

```bash
npx gitnexus call tool_map --json '{"repo":"<repo>"}'
npx gitnexus call tool_map --json '{"tool":"<toolName>","repo":"<repo>"}'
npx gitnexus context "<toolName>" --repo <repo>
npx gitnexus impact "<toolName>" --direction upstream --repo <repo>
```

Cline workflow:

1. List all tools.
2. Filter to requested tool.
3. Context handler symbol.
4. Impact before schema/signature changes.

### 30.12 Cline Skill: `gitnexus-cypher.md`

Purpose: advanced graph queries.

Required commands:

```bash
npx gitnexus read 'gitnexus://repo/<repo>/schema'
npx gitnexus cypher '<query>'
npx gitnexus call cypher --json '{"query":"<query>","repo":"<repo>"}'
```

Cline rules:

- Read schema before writing non-trivial Cypher.
- Start with `LIMIT`.
- Prefer read-only queries.
- Use returned symbols with `context` and source file reads.

### 30.13 Cline Skill: `gitnexus-group.md`

Purpose: multi-repo/group workflows.

Required commands:

```bash
npx gitnexus group list
npx gitnexus group list <name>
npx gitnexus group status <name>
npx gitnexus group sync <name> --json
npx gitnexus group contracts <name> --json
npx gitnexus group query <name> "<query>" --json
npx gitnexus group impact <name> --target <symbol> --repo <groupPath> --direction upstream --json
npx gitnexus read 'gitnexus://group/<name>/contracts'
npx gitnexus read 'gitnexus://group/<name>/status'
```

Cline workflow:

1. List/check group.
2. Run group status.
3. Sync if stale.
4. Query/impact.
5. Report cross-repo blind spots such as unmatched contracts.

### 30.14 Cline Skill File Size Guidance

Keep each Cline skill around 100-200 lines if possible.

If a skill grows larger:

- Move query templates to an appendix section.
- Keep the first 60 lines as quick-start workflow.
- Put safety rules near the relevant command.

Cline should not need to load all skills for every task. The main rule file should route it to the one relevant skill.

### 30.15 Cline Installation/Generation Command

Add a future command to generate Cline-friendly files:

```bash
npx gitnexus setup --cline
```

or:

```bash
npx gitnexus skills install --target cline
```

Recommendation for first implementation:

- Do not create a new complex command immediately.
- During `npx gitnexus analyze --skills`, also generate/update `.cline/skills/` and `.cline/rules/gitnexus.md` if a `.cline/` folder exists or if `--cline` is passed.

Possible CLI additions:

```bash
npx gitnexus analyze --skills --cline
npx gitnexus setup --cline
```

### 30.16 Cline-Specific Definition of Done

Add these DoD items to the overall implementation:

- [ ] `.cline/rules/gitnexus.md` exists and routes tasks to skill files.
- [ ] `.cline/skills/gitnexus-cli.md` exists.
- [ ] `.cline/skills/gitnexus-exploring.md` exists.
- [ ] `.cline/skills/gitnexus-debugging.md` exists.
- [ ] `.cline/skills/gitnexus-impact-analysis.md` exists.
- [ ] `.cline/skills/gitnexus-refactoring.md` exists.
- [ ] `.cline/skills/gitnexus-pr-review.md` exists.
- [ ] `.cline/skills/gitnexus-api-impact.md` exists.
- [ ] `.cline/skills/gitnexus-tool-map.md` exists.
- [ ] `.cline/skills/gitnexus-cypher.md` exists.
- [ ] `.cline/skills/gitnexus-group.md` exists.
- [ ] No Cline skill requires MCP.
- [ ] All Cline skill examples use real shell commands.
- [ ] Destructive operations are guarded by dry-run/review instructions.
- [ ] README documents Cline non-MCP usage.
- [ ] Tests or snapshots verify generated Cline files contain `npx gitnexus` commands and do not contain `gitnexus_query(` pseudo-tool syntax.
