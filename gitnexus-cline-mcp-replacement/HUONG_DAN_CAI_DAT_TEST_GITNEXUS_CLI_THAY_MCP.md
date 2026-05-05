# Hướng dẫn cài đặt và test GitNexus CLI thay MCP cho Cline

Tài liệu này hướng dẫn chi tiết cách copy bộ file `gitnexus-cline-mcp-replacement` vào source GitNexus, build lại CLI, rồi dùng command line để index/query source code thay cho MCP.

Ví dụ target source code cần phân tích là:

```text
D:\lmkd_code
```

> Lưu ý quan trọng: `D:\lmkd_code` là repo/app mà anh muốn GitNexus index và query. Còn source GitNexus là project tool riêng, ví dụ `D:\GitNexus` hoặc `C:\Users\SRV\Desktop\luc.tq\GitNexus`.

---

## 1. Hiểu đúng cấu trúc

Giả sử anh có 2 thư mục:

```text
D:\GitNexus              # Source code của tool GitNexus
D:\lmkd_code             # Source code dự án cần phân tích
```

Bên trong source GitNexus thường có package Node ở:

```text
D:\GitNexus\gitnexus
```

Các file CLI cần copy vào đúng package Node này:

```text
D:\GitNexus\gitnexus\src\cli\call.ts
D:\GitNexus\gitnexus\src\cli\read-resource.ts
D:\GitNexus\gitnexus\src\cli\index.ts
```

Không copy vào `node_modules` thủ công.

Lý do:

- `src/cli/read-resource.ts` là source TypeScript.
- Sau khi chạy `npm run build`, file này mới được compile ra `dist/cli/read-resource.js`.
- Command `gitnexus read ...` chỉ chạy được sau khi `index.ts` đã register command và project được build lại.

---

## 2. Các file trong package replacement

Package `gitnexus-cline-mcp-replacement` gồm:

```text
gitnexus-cline-mcp-replacement/
├── .cline.zip
├── HUONG_DAN_SU_DUNG.md
├── docs/plans/2026-05-05-cli-skills-mcp-replacement-plan.md
└── gitnexus/
    └── src/
        └── cli/
            ├── call.ts
            ├── index.ts
            └── read-resource.ts
```

Ý nghĩa:

| File | Mục đích |
|---|---|
| `call.ts` | Thêm command `gitnexus call <tool> --json '{...}'` để gọi GitNexus tools không cần MCP |
| `read-resource.ts` | Thêm command `gitnexus read 'gitnexus://...'` để đọc GitNexus resources không cần MCP |
| `index.ts` | File CLI entrypoint đã được sửa để register thêm `call` và `read` |
| `.cline.zip` | Bộ Cline rules/skills hướng dẫn Cline dùng CLI thay MCP |
| `HUONG_DAN_SU_DUNG.md` | Hướng dẫn tổng quan |

---

## 3. Bước 1 — Copy file CLI vào source GitNexus

### Cách khuyến nghị: copy bằng tay qua Explorer

Từ package replacement, copy:

```text
gitnexus-cline-mcp-replacement\gitnexus\src\cli\call.ts
```

vào:

```text
D:\GitNexus\gitnexus\src\cli\call.ts
```

Copy:

```text
gitnexus-cline-mcp-replacement\gitnexus\src\cli\read-resource.ts
```

vào:

```text
D:\GitNexus\gitnexus\src\cli\read-resource.ts
```

Với `index.ts`, có 2 lựa chọn.

### Lựa chọn A — Repo GitNexus chưa có thay đổi riêng ở `index.ts`

Copy overwrite:

```text
gitnexus-cline-mcp-replacement\gitnexus\src\cli\index.ts
```

vào:

```text
D:\GitNexus\gitnexus\src\cli\index.ts
```

### Lựa chọn B — Repo GitNexus có thay đổi mới ở `index.ts`

Không overwrite mù. Mở file:

```text
D:\GitNexus\gitnexus\src\cli\index.ts
```

Tìm khu vực các command CLI, gần các command như:

```ts
program
  .command('cypher <query>')
```

Thêm đoạn sau vào sau command `cypher`, trước `detect-changes` cũng được:

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

## 4. Bước 2 — Copy Cline skills/rules

Giải nén:

```text
gitnexus-cline-mcp-replacement\.cline.zip
```

Sau khi giải nén sẽ có:

```text
.cline\rules\gitnexus.md
.cline\skills\gitnexus-cli\SKILL.md
.cline\skills\gitnexus-exploring\SKILL.md
...
```

Copy cả thư mục `.cline` vào root source GitNexus:

```text
D:\GitNexus\.cline
```

Sau đó kiểm tra tồn tại:

```text
D:\GitNexus\.cline\rules\gitnexus.md
D:\GitNexus\.cline\skills\gitnexus-cli\SKILL.md
```

---

## 5. Bước 3 — Cài dependencies và build GitNexus CLI

Mở PowerShell tại Windows.

Chạy:

```powershell
cd D:\GitNexus\gitnexus
npm install
npm run build
```

Nếu chỉ muốn typecheck trước:

```powershell
npx tsc --noEmit
```

Expected:

- `npx tsc --noEmit` không báo lỗi TypeScript.
- `npm run build` tạo ra thư mục `dist`.
- Sau build, các file này nên tồn tại:

```text
D:\GitNexus\gitnexus\dist\cli\call.js
D:\GitNexus\gitnexus\dist\cli\read-resource.js
D:\GitNexus\gitnexus\dist\cli\index.js
```

Nếu `npm run build` timeout ở phần web UI/dependency phụ nhưng `npx tsc --noEmit` pass, thì phần CLI thường vẫn ổn. Tuy nhiên để chạy command bằng `node dist/cli/index.js`, cần đảm bảo `dist/cli/*.js` đã được sinh ra.

---

## 6. Bước 4 — Test command mới ngay trong GitNexus package

Tại:

```powershell
cd D:\GitNexus\gitnexus
```

Chạy help:

```powershell
node dist\cli\index.js --help
```

Trong output phải thấy có command:

```text
call <tool>
read <uri>
```

Test `call`:

```powershell
node dist\cli\index.js call list_repos --json '{}'
```

Test `read`:

```powershell
node dist\cli\index.js read 'gitnexus://repos'
```

Nếu chưa index repo nào, kết quả có thể là rỗng hoặc báo chưa có repo indexed. Như vậy command đã chạy được.

---

## 7. Bước 5 — Dùng GitNexus để index source `D:\lmkd_code`

Bây giờ chuyển sang source cần phân tích:

```powershell
cd D:\lmkd_code
```

Có 2 cách gọi CLI.

---

## Cách A — Gọi trực tiếp bằng `node` tới GitNexus build

Cách này chắc chắn nhất, không cần `npm link`.

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js status
```

Nếu chưa có index:

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js analyze
```

Sau khi analyze xong:

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js list
```

Query thử:

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js query "authentication flow"
```

Đọc resource repo list:

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js read 'gitnexus://repos'
```

Gọi tool qua `call`:

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js call list_repos --json '{}'
```

Nếu repo name trong `list` là `lmkd_code`, có thể gọi:

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js call query --json '{"query":"authentication flow","repo":"lmkd_code","limit":5}'
```

---

## Cách B — Dùng `npm link` để gọi `gitnexus` như global command

Tại package GitNexus:

```powershell
cd D:\GitNexus\gitnexus
npm link
```

Sau đó chuyển qua source cần phân tích:

```powershell
cd D:\lmkd_code
```

Test:

```powershell
gitnexus --help
```

Phải thấy command:

```text
call <tool>
read <uri>
```

Index:

```powershell
gitnexus status
gitnexus analyze
gitnexus list
```

Query:

```powershell
gitnexus query "authentication flow"
```

Gọi tool không qua MCP:

```powershell
gitnexus call query --json '{"query":"authentication flow","limit":5}'
```

Đọc resource không qua MCP:

```powershell
gitnexus read 'gitnexus://repos'
```

---

## 8. Test workflow thay MCP đầy đủ

Sau khi đã index `D:\lmkd_code`, chạy các lệnh sau.

### 8.1 Kiểm tra index/status

```powershell
cd D:\lmkd_code
gitnexus status
gitnexus list
```

Nếu dùng cách node trực tiếp:

```powershell
cd D:\lmkd_code
node D:\GitNexus\gitnexus\dist\cli\index.js status
node D:\GitNexus\gitnexus\dist\cli\index.js list
```

### 8.2 Search kiến trúc/code flow

```powershell
gitnexus query "login authentication session token" --limit 5
```

Hoặc:

```powershell
gitnexus call query --json '{"query":"login authentication session token","limit":5}'
```

### 8.3 Xem context symbol

Ví dụ symbol là `AuthService`:

```powershell
gitnexus context "AuthService"
```

Có source content:

```powershell
gitnexus context "AuthService" --content
```

### 8.4 Impact/blast radius

```powershell
gitnexus impact "AuthService" --direction upstream
```

Advanced qua `call`:

```powershell
gitnexus call impact --json '{"target":"AuthService","direction":"upstream","maxDepth":3}'
```

### 8.5 Detect local changes

```powershell
gitnexus detect-changes --scope all
```

Staged only:

```powershell
gitnexus detect-changes --scope staged
```

### 8.6 API impact

Ví dụ route là `/api/users`:

```powershell
gitnexus call api_impact --json '{"route":"/api/users"}'
```

Route map:

```powershell
gitnexus call route_map --json '{"route":"/api/users"}'
```

Shape check:

```powershell
gitnexus call shape_check --json '{"route":"/api/users"}'
```

### 8.7 Đọc graph resources

```powershell
gitnexus read 'gitnexus://repos'
gitnexus read 'gitnexus://setup'
gitnexus read 'gitnexus://repo/lmkd_code/context'
gitnexus read 'gitnexus://repo/lmkd_code/clusters'
gitnexus read 'gitnexus://repo/lmkd_code/processes'
gitnexus read 'gitnexus://repo/lmkd_code/schema'
```

Nếu repo name không phải `lmkd_code`, lấy đúng tên từ:

```powershell
gitnexus list
```

---

## 9. Cách dùng trong Cline thay MCP

Sau khi copy `.cline` vào root GitNexus hoặc root project dùng Cline, Cline sẽ đọc rule:

```text
.cline/rules/gitnexus.md
```

Nguyên tắc dùng:

- Không chạy `gitnexus mcp`.
- Không cần MCP server.
- Cline gọi shell command như:

```bash
npx gitnexus status
npx gitnexus analyze
npx gitnexus query "auth flow"
npx gitnexus call api_impact --json '{"route":"/api/users"}'
npx gitnexus read 'gitnexus://repos'
```

Nếu anh dùng local build chưa publish lên npm, trong Cline nên dùng một trong 2 cách:

### Option 1 — Dùng `npm link`

Sau khi `npm link`, Cline có thể gọi:

```bash
gitnexus status
gitnexus analyze
gitnexus call list_repos --json '{}'
```

### Option 2 — Dùng node path tuyệt đối

Không cần link:

```bash
node D:/GitNexus/gitnexus/dist/cli/index.js status
node D:/GitNexus/gitnexus/dist/cli/index.js analyze
node D:/GitNexus/gitnexus/dist/cli/index.js call list_repos --json '{}'
```

---

## 10. Troubleshooting

### Lỗi: không thấy command `read`

Nguyên nhân thường gặp:

1. Chưa copy `read-resource.ts` vào `D:\GitNexus\gitnexus\src\cli\`.
2. Chưa sửa/register command trong `src/cli/index.ts`.
3. Chưa chạy build lại.
4. Đang gọi nhầm bản `gitnexus` global cũ.

Kiểm tra:

```powershell
cd D:\GitNexus\gitnexus
node dist\cli\index.js --help
```

Nếu `node dist\cli\index.js --help` có `read` nhưng `gitnexus --help` không có, nghĩa là global command đang trỏ tới bản cũ. Chạy lại:

```powershell
cd D:\GitNexus\gitnexus
npm link
```

Hoặc bỏ global, dùng trực tiếp:

```powershell
node D:\GitNexus\gitnexus\dist\cli\index.js read 'gitnexus://repos'
```

### Lỗi: `Cannot find module './read-resource.js'`

Nguyên nhân:

- `index.ts` đã import lazy `./read-resource.js`, nhưng build chưa sinh ra `dist/cli/read-resource.js`.

Fix:

```powershell
cd D:\GitNexus\gitnexus
npm run build
```

Kiểm tra file:

```powershell
Test-Path D:\GitNexus\gitnexus\dist\cli\read-resource.js
```

### Lỗi: JSON payload bị sai trong PowerShell

PowerShell hay khó chịu với quote JSON. Dùng escape double quote:

```powershell
gitnexus call query --json '{"query":"auth flow","limit":5}'
```

Hoặc dùng stdin:

```powershell
'{"query":"auth flow","limit":5}' | gitnexus call query --stdin
```

### Lỗi: no indexed repositories

Chạy ở repo cần phân tích:

```powershell
cd D:\lmkd_code
gitnexus analyze
gitnexus list
```

### Lỗi native LadybugDB sau install

Thử:

```powershell
cd D:\GitNexus\gitnexus
npm rebuild @ladybugdb/core
```

Rồi build lại:

```powershell
npm run build
```

---

## 11. Checklist cuối cùng

Trong source GitNexus:

```powershell
cd D:\GitNexus\gitnexus
Test-Path src\cli\call.ts
Test-Path src\cli\read-resource.ts
npm install
npx tsc --noEmit
npm run build
node dist\cli\index.js --help
```

Help phải có:

```text
call <tool>
read <uri>
```

Trong source cần phân tích:

```powershell
cd D:\lmkd_code
gitnexus status
gitnexus analyze
gitnexus list
gitnexus call list_repos --json '{}'
gitnexus read 'gitnexus://repos'
gitnexus query "main architecture"
```

Nếu các lệnh trên chạy được, anh đã dùng GitNexus CLI thay MCP thành công.

---

## 12. Tóm tắt ngắn gọn

Đúng workflow là:

```powershell
# 1. Copy file vào source GitNexus
# call.ts -> D:\GitNexus\gitnexus\src\cli\call.ts
# read-resource.ts -> D:\GitNexus\gitnexus\src\cli\read-resource.ts
# index.ts -> merge/register command call/read

# 2. Build GitNexus CLI
cd D:\GitNexus\gitnexus
npm install
npm run build
npm link

# 3. Index source code cần phân tích
cd D:\lmkd_code
gitnexus analyze

# 4. Dùng CLI thay MCP
gitnexus query "auth flow"
gitnexus call api_impact --json '{"route":"/api/users"}'
gitnexus read 'gitnexus://repos'
```
