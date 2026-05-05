# Hướng dẫn sử dụng bộ Cline skills thay MCP cho GitNexus

Thư mục này chứa toàn bộ file đã tạo/sửa để Cline có thể sử dụng GitNexus mà không cần MCP.

Nguồn gốc: copy từ repo `C:\Users\SRV\Desktop\luc.tq\GitNexus`.

---

## 1. Mục tiêu

Trong môi trường công ty không dùng được MCP, Cline vẫn cần sử dụng được GitNexus để:

- Index/reindex codebase.
- Query kiến trúc/code flow.
- Xem context symbol.
- Phân tích impact/blast radius.
- Review PR/diff.
- Refactor/rename có dry-run.
- Phân tích API route/consumer/shape.
- Đọc graph resources như clusters/processes/schema.

Giải pháp trong bộ file này gồm 2 phần:

1. **Cline skills** dưới `.cline/`.
2. **CLI bridge commands** dưới `gitnexus/src/cli/`:
   - `gitnexus call <tool> --json '{...}'`
   - `gitnexus read 'gitnexus://...'`

---

## 2. Cấu trúc file trong package này

```text
gitnexus-cline-mcp-replacement/
├── .cline/
│   ├── rules/
│   │   └── gitnexus.md
│   └── skills/
│       ├── gitnexus-api-impact/
│       │   └── SKILL.md
│       ├── gitnexus-cli/
│       │   └── SKILL.md
│       ├── gitnexus-cypher/
│       │   └── SKILL.md
│       ├── gitnexus-debugging/
│       │   └── SKILL.md
│       ├── gitnexus-exploring/
│       │   └── SKILL.md
│       ├── gitnexus-group/
│       │   └── SKILL.md
│       ├── gitnexus-impact-analysis/
│       │   └── SKILL.md
│       ├── gitnexus-pr-review/
│       │   └── SKILL.md
│       ├── gitnexus-refactoring/
│       │   └── SKILL.md
│       └── gitnexus-tool-map/
│           └── SKILL.md
├── docs/
│   └── plans/
│       └── 2026-05-05-cli-skills-mcp-replacement-plan.md
└── gitnexus/
    └── src/
        └── cli/
            ├── call.ts
            ├── index.ts
            └── read-resource.ts
```

---

## 3. Cách áp dụng vào repo GitNexus

Repo đích giả định:

```text
C:\Users\SRV\Desktop\luc.tq\GitNexus
```

Từ package này, copy các thư mục/file sau vào repo GitNexus tương ứng:

```text
.cline/                              → GitNexus/.cline/
docs/plans/...                       → GitNexus/docs/plans/...
gitnexus/src/cli/call.ts             → GitNexus/gitnexus/src/cli/call.ts
gitnexus/src/cli/read-resource.ts    → GitNexus/gitnexus/src/cli/read-resource.ts
gitnexus/src/cli/index.ts            → GitNexus/gitnexus/src/cli/index.ts
```

Lưu ý:

- `index.ts` là file đã sửa để register thêm command `call` và `read`.
- Nếu repo GitNexus đã có thay đổi mới hơn ở `index.ts`, cần merge phần command registration thay vì overwrite mù.

Phần cần merge trong `gitnexus/src/cli/index.ts` là:

```ts
program
  .command('call <tool>')
  .description('Call any GitNexus local tool directly without MCP')
  .option('--json <payload>', 'JSON object payload for the tool', '{}')
  .option('--stdin', 'Read JSON object payload from stdin')
  .option('-r, --repo <name>', 'Target repository; merged into payload when payload.repo is absent')
  .option('--compact', 'Print compact JSON instead of pretty JSON')
  .action(createLazyAction(() => import('./call.js'), 'callCommand'));

program
  .command('read <uri>')
  .description('Read a GitNexus resource URI directly without MCP')
  .action(createLazyAction(() => import('./read-resource.js'), 'readResourceCommand'));
```

---

## 4. Hai command mới dùng để thay MCP

### 4.1 `gitnexus call`

Dùng để gọi GitNexus tools qua CLI thay vì MCP.

Format:

```bash
npx gitnexus call <tool-name> --json '{...}'
```

Ví dụ:

```bash
npx gitnexus call list_repos --json '{}'
npx gitnexus call query --json '{"query":"auth flow","repo":"my-app"}'
npx gitnexus call api_impact --json '{"route":"/api/users","repo":"my-app"}'
npx gitnexus call route_map --json '{"repo":"my-app"}'
npx gitnexus call shape_check --json '{"route":"/api/users","repo":"my-app"}'
npx gitnexus call tool_map --json '{"tool":"searchUsers","repo":"my-app"}'
npx gitnexus call rename --json '{"symbol_name":"oldName","new_name":"newName","dry_run":true}'
```

Đọc payload từ stdin:

```bash
echo '{"query":"auth flow"}' | npx gitnexus call query --stdin
```

Thêm repo bằng flag:

```bash
npx gitnexus call query --repo my-app --json '{"query":"auth flow"}'
```

### 4.2 `gitnexus read`

Dùng để đọc GitNexus resources qua CLI thay vì MCP.

Format:

```bash
npx gitnexus read 'gitnexus://...'
```

Ví dụ:

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

---

## 5. Cách Cline sử dụng skills

Entry point chính:

```text
.cline/rules/gitnexus.md
```

File này route task sang đúng skill:

| Task | Skill |
|---|---|
| Setup/index/status/list/wiki | `.cline/skills/gitnexus-cli/SKILL.md` |
| Hiểu architecture/code flow | `.cline/skills/gitnexus-exploring/SKILL.md` |
| Debug lỗi | `.cline/skills/gitnexus-debugging/SKILL.md` |
| Impact/blast radius | `.cline/skills/gitnexus-impact-analysis/SKILL.md` |
| Refactor/rename | `.cline/skills/gitnexus-refactoring/SKILL.md` |
| PR review | `.cline/skills/gitnexus-pr-review/SKILL.md` |
| API route/shape/consumer | `.cline/skills/gitnexus-api-impact/SKILL.md` |
| Tool definitions/handlers | `.cline/skills/gitnexus-tool-map/SKILL.md` |
| Cypher nâng cao | `.cline/skills/gitnexus-cypher/SKILL.md` |
| Multi-repo group | `.cline/skills/gitnexus-group/SKILL.md` |

Mỗi skill theo format:

```text
skill-name/
└── SKILL.md
```

Trong `SKILL.md` có metadata:

```md
---
name: gitnexus-example
description: Use when ...
---
```

và hướng dẫn chi tiết cho Cline ở bên dưới.

---

## 6. Workflow khuyến nghị sau khi áp dụng

### Bước 1: Build/typecheck

Trong repo GitNexus:

```bash
cd C:\Users\SRV\Desktop\luc.tq\GitNexus\gitnexus
npx tsc --noEmit
```

Hoặc trên WSL:

```bash
cd /mnt/c/Users/SRV/Desktop/luc.tq/GitNexus/gitnexus
npx tsc --noEmit
```

### Bước 2: Chạy test tối thiểu

```bash
npm test -- --run test/unit/tool-direct-cli.test.ts test/unit/resources.test.ts
```

Khi implement ban đầu, kết quả đã verify:

```text
2 test files passed
41 tests passed
```

### Bước 3: Smoke test CLI command

Sau khi build xong:

```bash
node dist/cli/index.js --help
node dist/cli/index.js call list_repos --json '{}'
node dist/cli/index.js read 'gitnexus://repos'
```

Expected nếu chưa index repo nào:

```text
[]
repos: []
# No repositories indexed. Run: gitnexus analyze
```

---

## 7. Lưu ý build hiện tại

Trong lần implement ban đầu:

- `npx tsc --noEmit` passed.
- Unit tests passed.
- `npm run build` compile core OK nhưng bị timeout ở bước install/build `gitnexus-web`, do dependency install/build web UI, không phải lỗi TypeScript của `call/read`.

Nếu gặp lỗi native LadybugDB sau `npm ci --ignore-scripts`, chạy:

```bash
npm rebuild @ladybugdb/core
```

---

## 8. Khi nào dùng skill nào?

### Index/reindex repo

```bash
npx gitnexus status
npx gitnexus analyze
npx gitnexus list
```

Đọc skill:

```text
.cline/skills/gitnexus-cli/SKILL.md
```

### Hiểu một feature hoạt động thế nào

```bash
npx gitnexus query "authentication flow" --repo <repo>
npx gitnexus context "AuthService" --repo <repo>
```

Đọc skill:

```text
.cline/skills/gitnexus-exploring/SKILL.md
```

### Xem thay đổi có làm vỡ gì không

```bash
npx gitnexus impact "<symbol>" --direction upstream --repo <repo>
npx gitnexus detect-changes --scope all --repo <repo>
```

Đọc skill:

```text
.cline/skills/gitnexus-impact-analysis/SKILL.md
```

### Phân tích API route

```bash
npx gitnexus call api_impact --json '{"route":"/api/users","repo":"<repo>"}'
```

Đọc skill:

```text
.cline/skills/gitnexus-api-impact/SKILL.md
```

### Rename/refactor

Luôn dry-run trước:

```bash
npx gitnexus call rename --json '{"symbol_name":"oldName","new_name":"newName","dry_run":true,"repo":"<repo>"}'
```

Chỉ apply sau khi review:

```bash
npx gitnexus call rename --json '{"symbol_name":"oldName","new_name":"newName","dry_run":false,"repo":"<repo>"}'
```

Đọc skill:

```text
.cline/skills/gitnexus-refactoring/SKILL.md
```

---

## 9. Safety rules quan trọng

- Không dùng MCP trong workflow Cline này.
- Nếu `status` báo stale index, chạy `npx gitnexus analyze` trước khi tin kết quả graph.
- `rename` phải chạy `dry_run:true` trước.
- `wiki` có thể gọi LLM provider bên ngoài, cần kiểm tra policy công ty.
- `analyze --embeddings` có thể dùng local hoặc remote embedding tùy config, cần kiểm tra policy công ty.
- Graph static analysis có thể miss dynamic call/reflection/string route/generated code, nên vẫn phải đọc source file trước khi kết luận cuối.

---

## 10. Checklist hoàn tất

Sau khi copy vào repo GitNexus, kiểm tra:

```bash
# Có đủ 10 skill
find .cline/skills -maxdepth 2 -type f -name SKILL.md | wc -l

# Không còn pseudo MCP tool syntax trong skills
grep -RIn "gitnexus_[a-zA-Z]*(" .cline/skills .cline/rules || true

# Typecheck CLI
cd gitnexus
npx tsc --noEmit

# Test tối thiểu
npm test -- --run test/unit/tool-direct-cli.test.ts test/unit/resources.test.ts
```

Expected:

```text
10
# grep không trả ra dòng nào
# tsc không lỗi
# tests passed
```
