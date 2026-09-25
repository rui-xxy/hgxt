# HGXT 基础底座整改说明

> 版本：v1.1（2026-09）
> 状态：**六阶段已全部实施完成**（实施记录见文末）
> 定位：本文档是**可执行的工作规格**，不是泛泛的优化建议。每个条目有唯一编号（A1…F4），按「现状 → 为什么是问题 → 不改会怎样 → 怎么改 → 完成标准」五段展开。后续开发会话直接引用编号（如"完成 A1"）即可开工。
>
> 总体结论不变：`pnpm Monorepo + React + NestJS + Prisma + PostgreSQL` 技术路线没有问题，**不重新搭架构**。本整改只修底座，在第一个真实业务模块（审批/表单/项目等）开工之前完成。

---

## 使用规则

1. **顺序即优先级**：A（安全不变量）> B（运行环境）> C（测试链）> D（前端认证）> E（契约）> F（工程质量）。A 未完成前不开始任何业务模块。
2. **完成标准是验收线**：每条目的「完成标准」全部勾选才算完成，不允许"基本完成"。
3. **每阶段结束跑回归**：阶段一之前先把现有 28 项接口流程固化成自动化回归（C 阶段的第一个产出提前到 A 之前做最小版本：`verify` 脚本入库存档），此后每阶段结束必须全绿。
4. **明确不做**（凭想象设计的架构一律缓建）：RBAC 五表、动态表单引擎、工作流引擎、部门岗位、租户隔离、Token Family / Device Session（列为 V2+ 候选，见各条目备注）。

---

# A. 安全不变量（最高优先级）

> 安全不变量 = 无论用户怎么操作、请求怎么并发、网络怎么异常，系统都必须成立的规则：
> - 一个 Refresh Token 只能换出一套新 Token；
> - 密码重置后旧登录状态立即全部失效；
> - 安全相关写操作不允许"执行一半"；
> - 任何时刻系统至少有一个可用的 SUPER_ADMIN；
> - 认证接口不能被无限调用。

## A1. Refresh Token 轮换的并发原子性

**现状**
`apps/api/src/auth/auth.service.ts` 的 `refresh()`：查询 → 校验 → `update` 标记 revoked → `create` 新 Token。四步是独立语句，不是原子操作。

**为什么是问题**
两个并发请求（如两个浏览器标签页共享同一 localStorage Refresh Token，但 JS 状态独立，各自的 401 单飞拦不住对方）都能在读到 `revokedAt = null` 后各自作废、各自签发新 Token——一个旧 Token 换出两套新凭据，违背"一次性"设计。更糟的是与复用检测（发现 revoked 被再次使用 → 吊销该用户全部会话）叠加后，**正常的并发刷新可能被误判为 Token 泄露，导致全端下线**。

**不改会怎样**
业务模块上线后，多标签页是常态。用户会随机遭遇"无缘无故被踢回登录页"（误判吊销）或产生幽灵会话（双套 Token 并存），且都是难以复现的偶发问题。等审批等敏感操作建立在会话之上后，回头改认证体系的波及面非常大。

**怎么改**
原子性交给数据库，用**条件更新抢占**，不依赖前端：

```ts
// auth.service.ts — $transaction 内
const claimed = await tx.refreshToken.updateMany({
  where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
  data: { revokedAt: new Date() },
});
if (claimed.count !== 1) {
  // 0 行 = 已被并发请求抢先消费（或已失效）→ 拒绝本次刷新
  throw new UnauthorizedException('登录状态已变更，请重新登录');
}
// 抢占成功者才允许 create 新 Refresh Token，同事务 COMMIT
```

已 revoked 的行被再次使用仍然走"疑似泄露 → 吊销全部"逻辑，保留。

配套说明：抢占失败的标签页收到 401 后，靠 D2（storage 事件同步）拿到赢家写入的新 Token 自动恢复，而不是死循环——A1 与 D2 是一对，实施 A1 时 D2 至少要排进同一阶段前后。

**完成标准**
- [ ] 两个并发 refresh（`Promise.all` 发两个请求）恰好一个 200、一个 401，且数据库中该用户有效 Refresh Token 只新增一套；
- [ ] 集成测试覆盖：正常刷新 / 旧 Token 复用被拒并吊销全部 / 过期不能刷 / 禁用用户不能刷 / 并发只赢一个；
- [ ] 前端两个标签页同时触发 401 刷新时，最终两个标签页都能继续正常使用（依赖 D2 时可注明"待 D2"）。

## A2. 引入 authVersion，让"重置密码"真正立即踢掉旧 Access Token

**现状**
密码重置只吊销 Refresh Token。已签发的 Access Token（15 分钟）依然有效。界面上"该用户的登录状态已全部失效"的提示**当前并不准确**。

**为什么是问题**
被重置密码的账号在最长约 15 分钟窗口内仍可用旧 Access Token 调用所有接口。对"员工离职立即禁用/重置"这类场景，这 15 分钟就是真实的风险窗口。

**不改会怎样**
审批、数据权限等模块建成后，"改了密码还能继续操作一刻钟"会从安全瑕疵升级成业务事故（例如审批指令以被离职员工身份发出）。

**怎么改**
1. `schema.prisma` 的 `User` 增加 `authVersion Int @default(1)`，迁移；
2. 签发 JWT 时 payload 加 `ver: user.authVersion`；
3. `JwtAuthGuard` 本来就每请求回查用户，顺带校验 `payload.ver === user.authVersion`，不等则 401「登录状态已变更，请重新登录」；
4. 重置密码（及未来任何"强制下线/安全重置"）时 `authVersion: { increment: 1 }`；
5. 修正前端/接口文档中的提示文案。

该机制后续可直接复用于：管理员强制下线、账号异常处置、全端登出——V1 只落重置密码一处。

**完成标准**
- [ ] 重置密码后，旧 Access Token 的下一次请求立即 401（集成测试断言，不等过期）；
- [ ] 正常登录/刷新不受影响（回归全绿）；
- [ ] 提示文案与真实行为一致。

## A3. 密码重置、禁用/启用改为事务写

**现状**
`users.service.ts` 的 `resetPassword()` 与 `updateStatus()` 都是两步独立写：先改 User，再吊销 RefreshToken，两步分属不同隐式事务。第一步成功、第二步失败会留下"密码已改但会话未吊销"的中间态。

**为什么是问题**
安全操作出现半成功状态，等于不变量失效——且这种失败只在数据库抖动/进程被杀时出现，开发期几乎遇不到，上线后难排查。

**不改会怎样**
A2 的 authVersion 使"改 User + 吊销 Token"的原子性从"锦上添花"变成"必须"：版本号加了、Token 没吊销，会出现新旧 Token 混用的混乱窗口。

**怎么改**
`prisma.$transaction(async (tx) => { ... })` 包裹全部写操作；`UsersService` 内写库一律通过事务句柄 `tx`。`updateStatus`（禁用分支吊销会话）与 `resetPassword`（改哈希 + authVersion+1 + 吊销会话）均改造。

**完成标准**
- [ ] 两个方法均为单事务，任一步抛错全部回滚（集成测试用 mock 注入一次失败验证无半写入）；
- [ ] 既有禁用/重置密码行为回归全绿。

## A4. 系统级不变量：任何时刻 ACTIVE SUPER_ADMIN ≥ 1

**现状**
只防了"不能禁用自己"。没有防：最后一个管理员把自己 `SUPER_ADMIN → USER`；管理员 A 禁用管理员 B 后自降角色等组合操作。

**为什么是问题**
SUPER_ADMIN 归零后系统照常运行，但再没有任何账号能进入用户管理，只能去数据库手工修复——这是典型的"系统级锁死"，而且是 API 直接可触发的（前端藏按钮不解决问题）。

**不改会怎样**
一次误操作就需要连数据库才能自救；如果发生在生产，等于管理权移交事故。

**怎么改**
写一个事务内检查助手（示意）：

```ts
async assertNotLastActiveSuperAdmin(tx, targetId, next: { role?: Role; status?: UserStatus }) {
  const target = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
  const losesAdmin =
    (next.role && target.role === 'SUPER_ADMIN' && next.role !== 'SUPER_ADMIN') ||
    (next.status === 'DISABLED' && target.role === 'SUPER_ADMIN');
  if (!losesAdmin) return;
  const remaining = await tx.user.count({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: targetId } },
  });
  if (remaining === 0) throw new BadRequestException('系统至少需要保留一个启用状态的管理员');
}
```

在 `update`（角色变更）与 `updateStatus`（禁用）中调用，**检查与写入同一事务**（防 A、B 管理员并发互改的竞态）。

**完成标准**
- [ ] 仅剩一个管理员时：自降角色被拒、被禁用被拒（集成测试）；
- [ ] 存在两个及以上管理员时：上述操作正常放行；
- [ ] 并发场景（两个请求同时动最后两个管理员）不产生归零（事务 + 条件保证，可用并发测试或代码审查确认）。

## A5. 登录/刷新接口限流

**现状**
`POST /api/auth/login` 与 `POST /api/auth/refresh` 无任何频率限制。

**为什么是问题**
两个攻击面：密码爆破可以无限尝试；Argon2id 校验本身故意消耗 CPU/内存，高频打登录接口等于低成本 DoS。

**不改会怎样**
内网部署不等于没有威胁（员工脚本、被控内网机器）。且这是"出事才补"的典型——补的时候往往已经在被打了。

**怎么改**
`@nestjs/throttler`（6.7.1，已验证兼容 Nest 12）：

- 全局默认宽松（如 100 次/分/IP），`/api/auth/login` 单独 `@Throttle` 收紧到 **10 次/分/IP**，`/api/auth/refresh` 30 次/分/IP；
- 429 响应体中文文案「请求过于频繁，请稍后再试」；
- V1 用内置内存存储即可（单实例）；文档注明多实例部署时需换 Redis 存储（不做）；
- 超限在 Swagger 上可见，方便联调时理解 429。

**完成标准**
- [ ] 同 IP 第 11 次登录请求（1 分钟内）返回 429；
- [ ] 前端登录页对 429 展示可读文案而非通用失败；
- [ ] 刷新接口限流不影响正常单页面使用（正常节奏 < 30 次/分）。

---

# B. 收紧默认运行环境

> 原则：开发便利的默认值不允许成为部署默认值。本阶段完成后，`NODE_ENV=production` 启动即具备基本安全姿态。

## B1. PostgreSQL 只监听本机回环

**现状**：`docker-compose.yml` 映射 `"5433:5432"`，实际监听 `0.0.0.0`，局域网可直连一个 `postgres/postgres` 弱口令库。
**怎么改**：改为 `"127.0.0.1:5433:5432"`。部署时走 Docker 内网/内网地址，不经宿主机暴露端口。
**完成标准**
- [ ] `netstat` 确认 5433 仅监听 127.0.0.1；
- [ ] 局域网其他机器 telnet 5433 不通（可测可不测，标准以监听地址为准）。

## B2. API 监听地址环境化

**现状**：`main.ts` 写死 `app.listen(port, '0.0.0.0')`。
**怎么改**：`app.listen(port, process.env.HOST ?? '127.0.0.1')`；`.env.example` 增加 `HOST=127.0.0.1`，生产部署显式设 `HOST=0.0.0.0`（或反代同机回环）。启动日志打印实际地址。
**完成标准**
- [ ] 默认启动仅本机可访问；设置 `HOST=0.0.0.0` 后恢复对外监听；
- [ ] 代码中不再出现写死的 `0.0.0.0`。

## B3. seed 取消默认管理员密码

**现状**：未配置 `SEED_ADMIN_PASSWORD` 时使用硬编码 `Admin@123456` 且明文打印。
**怎么改**：缺该环境变量直接报错退出（「缺少 SEED_ADMIN_PASSWORD，请显式配置初始管理员密码」）；成功后只输出「已创建管理员：admin」，不输出密码。README 同步更新。
**完成标准**
- [ ] 无变量时 seed 拒绝执行；
- [ ] seed 输出中任何位置不出现密码明文；
- [ ] 新同事按 README 能无歧义完成初始化。

## B4. Swagger 生产默认关闭

**现状**：`/api/docs` 无条件挂载。
**怎么改**：`NODE_ENV !== 'production'` 时挂载；生产如需开启用 `ENABLE_SWAGGER=true` 显式打开。`NODE_ENV` 缺省按 development。
**完成标准**
- [ ] `NODE_ENV=production` 启动后 `/api/docs` 404；
- [ ] 开发环境不受影响。

## B5. JWT Secret 启动校验

**现状**：`JWT_ACCESS_SECRET` 存在即可，弱值照常启动。
**怎么改**：启动时校验：非空、长度 ≥ 32、不等于开发示例值；生产环境不满足**拒绝启动**并给出明确错误，开发环境降级为醒目警告。
**完成标准**
- [ ] 生产 + 弱 secret 启动即失败，错误信息可读；
- [ ] 开发环境现状不受影响。

## B6. Helmet 基础安全头

**现状**：无任何安全头。
**怎么改**：`helmet@^8`，`app.use(helmet(...))`。注意：默认 CSP 会拦 Swagger UI 的内联脚本，开发环境关闭 CSP、生产保留：
`contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false`。
**完成标准**
- [ ] `curl -I` 可见 `X-Content-Type-Options` 等安全头；
- [ ] 开发环境 Swagger 可正常打开；生产配置下 Swagger（若开启）与前端跨域策略不被意外破坏（生产前端同源反代，理论上无 CORS 依赖，记录验证结论即可）。

---

# C. 建立测试链与工程检查门

> 测试的目的不是覆盖率数字，是**给后续的人和 AI 划红线**：AI 最擅长写新代码，最容易破坏旧规则——测试就是把"隐含规则"变成"可执行断言"。

## C1. 后端集成测试（先做，护栏价值最大）

**怎么改**
- 选型 **Vitest**（monorepo 统一 runner；Nest 的 `@nestjs/testing` + `supertest` 在 Vitest 下工作正常）；
- 独立测试库：`DATABASE_URL_TEST`（如 `hgxt_test`），globalSetup 里执行 `prisma migrate deploy` + 清库；
- 直接起完整 `AppModule`（真实守卫/限流/事务路径），HTTP 层断言。

**必须覆盖的用例清单**（即本文档 A/B 阶段验收测试的载体）：

| 模块 | 用例 |
| --- | --- |
| Refresh Token | 正常刷新；旧 Token 复用被拒并吊销全部；**并发刷新只成功一个（A1）**；过期不能刷；禁用用户不能刷 |
| 权限 | USER 访问 /users 403；SUPER_ADMIN 200；未登录 401 |
| 管理员不变量 | 不能禁用/降级最后一个管理员（A4） |
| 密码重置 | 重置成功；Refresh 全失效；**旧 Access 立即失效（A2）**；新密码可登录、旧密码不可 |
| 用户禁用 | 禁用后旧 Access 立即失效；不能刷新；不能重登 |
| 登录 | 错误密码 401；禁用 403；**超限 429（A5）** |
| 参数校验 | 弱密码/非法角色/非法 username（E1 后）400 |

**完成标准**
- [ ] `apps/api` 内 `pnpm test` 一键运行上述全部用例且全绿；
- [ ] 用例清单与本表一致（允许增补，不允许缺失）。

## C2. 前端认证层测试

**范围**：只测 `api/client.ts` 状态机与 `RequireAuth` 分支（不测按钮颜色）：
401 → 单飞刷新 → 重放原请求；刷新失败 → 回登录页；**网络错误/500 → 不登出**（D1）。多标签 storage 同步（D2）的收发行为。

**完成标准**
- [ ] mock fetch 下三类场景（认证失败/服务器错误/网络错误）行为各自正确；
- [ ] `storage` 事件驱动的登出/换 Token 同步有断言。

## C3. 统一检查命令 `pnpm check`

**怎么改**
根目录补齐：`pnpm lint`（根级 ESLint flat config：typescript-eslint + react-hooks，覆盖三个包）→ `pnpm typecheck`（各包 `tsc --noEmit`）→ `pnpm test` → `pnpm build`，组合成：

```
pnpm check = lint + typecheck + test + build
```

**使用铁律**：任何人或 AI 修改代码后，`pnpm check` 全绿才算完成。这条写进仓库根的 `AGENTS.md`（AI 协作说明），比任何"请认真点"的提示词可靠。

**完成标准**
- [ ] 四个命令在根目录一键可用，全绿；
- [ ] `AGENTS.md` 存在并写明该规则；
- [ ] 故意引入一个类型错误/一个 lint 错误，`pnpm check` 能分别拦住（验证一次）。

---

# D. 前端认证状态机

## D1. 区分「认证失败 / 服务器错误 / 网络错误」，消灭登录跳转循环

**现状**
`RequireAuth` 把 `/me` 的**任何**失败都当登录失效跳 `/login`；`LoginPage` 又把"localStorage 有 token"当已登录直接跳回后台。于是：网络中断或后端 500 时 → 后台踢到登录页 → 登录页发现有 token 又弹回后台 → 循环。

**为什么是问题 / 不改会怎样**
后端重启、断网、502 这些**最常见的日常故障**会被渲染成"闪来闪去的鬼畜页面或白屏"，且用户误以为被登出，重新登录还登不进去。业务模块越多、后端重启越频繁，越日常。

**怎么改**
`client.ts` 的 `ApiError` 增加类别字段：

```
kind: 'auth'      // 401/403，且刷新已失败
     | 'server'   // 5xx
     | 'network'  // fetch 抛错（断网/拒连）
```

- `request()` 中：网络异常包装为 `kind: 'network'`；刷新失败的 401 才触发 `onAuthFailure`；
- `RequireAuth`：仅 `kind === 'auth'` 跳登录；`server`/`network` 渲染独立错误页：「无法连接服务器 [重新加载]」；
- `LoginPage`：不再仅凭 localStorage 存在 token 就重定向（由守卫的 /me 结果决定）。

**完成标准**
- [ ] 停掉 API 后打开前端：显示错误页 + 重试按钮，URL 不变、不跳登录；
- [ ] API 恢复后点重试直接恢复，无需重新登录（token 未失效时）；
- [ ] C2 的自动化断言覆盖此分支。

## D2. 多标签页登录状态同步

**现状**：A 标签登出，B 标签无感知；A 刷新了 Token，B 仍持旧值——与 A1 并发竞争直接相关。
**怎么改**：`tokenStore.setTokens/clear` 时通过 `BroadcastChannel('hgxt:auth')` 广播（`storage` 事件做兜底）；其他标签页收到 `logout` → 清查询缓存跳登录；收到 `tokens-updated` → 无需动作（每次请求实时读 localStorage），仅清 `me` 缓存。
**完成标准**
- [ ] 两标签页：其一登出，另一在 1 秒内到登录页；
- [ ] 两标签页并发 401：败者借助胜者写入的新 Token 自动恢复（配合 A1）；
- [ ] C2 覆盖收发断言。

## D3. 弹窗与按钮防重复提交

**现状**：`UserFormModal` / `ResetPasswordModal` 的确认按钮未接 `confirmLoading`，快速双击可能双发 POST；表格行内状态切换按钮同样无 pending 态。
**怎么改**：所有变更类 Modal 统一 `confirmLoading={mutation.isPending}` + `onOk` 入口 `if (pending) return` 守卫；行内"禁用/启用/重置密码"按钮加 `loading`。统一做成小组件或约定，不允许逐页即兴。
**完成标准**
- [ ] 快速双击任一确认按钮只产生一次请求（Network 面板验证）；
- [ ] 请求进行中按钮呈现 loading 且不可再点。

---

# E. 收紧 API 契约

## E1. username 规则以后端为准

**现状**：前端正则 `^[a-zA-Z0-9_-]{2,64}$`，后端只校验非空 + ≤64——直调 API 可创建 `@@@@` 这类用户名。
**怎么改**：`CreateUserDto` 增加 `@Matches(/^[a-zA-Z0-9_-]{2,64}$/)`；错误信息与前端一致。**前端校验永远只是提前提示，不是规则。**
**完成标准**：[ ] 直调 API 提交非法 username 返回 400 与可读文案；[ ] C1 用例覆盖。

## E2. username 大小写：统一小写存储（不区分大小写）

**现状**：PostgreSQL 默认大小写敏感——`admin`、`Admin`、`ADMIN` 可同时存在三个账号；而搜索又是 case-insensitive，认知分裂。
**怎么改**：规则定为**入库统一 `toLowerCase()`**：创建时规范化、登录时规范化后查询；迁移 `UPDATE users SET username = lower(username)`（现库仅 2 行，冲突风险为零；迁移脚本内如遇冲突让迁移失败即可暴露）；登录/创建的错误文案注明"用户名不区分大小写"。
**完成标准**
- [ ] `Admin` 与 `admin` 不能同时存在（后创建者 409）；
- [ ] 输入 `ADMIN` 大小写任意组合可登录；
- [ ] 迁移可重复执行（幂等：`lower()` 后已符合的行不变）。

## E3. 可空字段的 PATCH 语义统一为 `undefined=不改 / null=清空 / string=设置`

**现状**：三套说法并存——shared 类型是 `string | null`，实际生效的是"前端把空串转 null"，而 Swagger 文档写的是"空字符串清空"。文档在撒谎。
**怎么改**：
- `UpdateUserDto`：`email?: string | null`，`@IsOptional() @IsNullable() @IsEmail()`（class-validator 两者组合可区分 undefined 与 null）；
- service：`undefined → 不写 / null → 置 null / string → 校验后写入`；删除"空串清空"逻辑与文档表述；
- Swagger 标注 `nullable: true`；`docs/api.md`、shared 注释同步；
- 前端现状（发 null）已正确，仅确认不回归。
**完成标准**
- [ ] 三种输入（缺省字段/显式 null/字符串）各产生预期结果，集成测试断言；
- [ ] Swagger 与 api.md 与实现三者一致。

## E4. 修正 shared 的定位表述

**现状**：shared 注释自称"唯一契约来源"，但实际存在四份相关定义（shared interface / class-validator DTO / Prisma schema / Swagger）。
**怎么改**：措辞改为「前后端 **TypeScript 数据契约**的共享层；DTO 与 schema 通过评审 + 测试保持一致」。文档（architecture.md）补一段：业务模块明显增多后，评估 Zod / OpenAPI codegen 走 schema-first——**现在不做**（过早复杂化）。
**完成标准**：[ ] 注释与文档表述一致且不夸大；[ ] 评估结论有记录（哪怕结论是"继续手工同步"）。

---

# F. 工程质量

## F1. 构建可复现：build 显式生成 Prisma Client

**现状**：`generated/` 被 gitignore，`pnpm build` 依赖"本机恰好跑过 prisma generate"。新机器 `clone → install → build` 可能直接失败。
**怎么改**：`apps/api` 的 `build` 改为 `prisma generate && nest build`（generate 只依赖 schema，不需要数据库）。
**完成标准**：[ ] 删除 `apps/api/src/generated` 后 `pnpm build` 仍成功；[ ] 一台干净目录（或 CI）clone → install → build 通过。

## F2. 依赖漏洞治理政策

**现状**（已核实 `pnpm audit`）：3 项（2 High + 1 Moderate），路径全部为 `apps/api > prisma > mysql2`——是 Prisma CLI 的间接依赖，HGXT 用 PostgreSQL，**实际风险很低**。
**政策**（写进 architecture.md）：
1. 不因 audit 红字恐慌性换依赖；
2. 每月/每迭代跟进 Prisma 7.x 小版本升级（`pnpm up prisma @prisma/client @prisma/adapter-pg`），升级后重跑 audit + 全量回归；
3. 若升级长期不消化，评估 `pnpm.overrides` 强制 `mysql2 >= 3.23.1`（需回归验证与 Prisma CLI 兼容）。
**完成标准**：[ ] 政策条目入档；[ ] 当前升级到能消化的最新 7.x 并记录 audit 余量。

## F3. 路由级拆包

**现状**：3 个页面打出一个 ~1.17MB（gzip 376KB）主包。现在可接受，未来审批/图表/富文本全进首屏会快速膨胀。
**怎么改**：页面级 `React.lazy` + `Suspense`（fallback 用紧凑 Spin）；路由不变。
**完成标准**：[ ] `vite build` 产物中 Users/Login 为独立 chunk；[ ] 主包不再包含用户管理页代码；[ ] 路由切换无可见闪烁（fallback 轻量）。

## F4. 把 DESIGN.md 变成 HGXT 自己的设计系统（已按用户要求回退，见文末实施记录）

**现状**：根 DESIGN.md 是 ZCode（AI Chat 产品）的设计系统，大量 Chat/Diff/Terminal/Workflow 规则与 HGXT 企业后台无关；目前靠 ui-mapping.md 做转换层，长期会让每个 AI 会话读到无关规则产生干扰。
**怎么改**：
1. 原文移至 `docs/reference/zcode-design-system.md`（保留出处与思想来源）；
2. 根 DESIGN.md 重写为 **HGXT Design System**：只保留适用于企业运营后台的部分——字号刻度、颜色分层、圆角层级、密度、间距、表格/表单/Modal/菜单/布局规范、主题机制、国际化与可访问性；开头一句定位：「HGXT 是企业运营后台：密集、冷静、操作型；不是营销页、不是 Chat UI、不是大圆角卡片 Dashboard」；
3. `docs/ui-mapping.md` 改为与之配套的实现映射（引用 AntD token），删除对已移除章节的引用。
**完成标准**
- [ ] 根 DESIGN.md 中不再出现 Chat/Diff/Terminal/Conversation/Workflow 等无关规则；
- [ ] 现有页面视觉零变化（纯文档重构）；
- [ ] 新开 AI 会话读根 DESIGN.md + ui-mapping.md 即可正确产出 HGXT 风格页面。

---

# 实施顺序与阶段验收

| 阶段 | 内容 | 出口条件（全部满足才进下一阶段） |
| --- | --- | --- |
| 〇 | 现有 28 项流程固化为可重复执行的回归脚本（C1 的前身，先手工脚本化入库存档） | 脚本入库存档，当前全绿 |
| 一 | A1–A5 安全不变量 | C1 安全用例全绿；28 项回归全绿（含**有意的行为变化**：并发刷新第二请求必败、重置密码旧 Access 立即失效、文案修正） |
| 二 | B1–B6 运行环境 | B 各条完成标准勾选；回归全绿 |
| 三 | C1–C3 测试链与 `pnpm check` | `pnpm check` 一键全绿；AGENTS.md 就位 |
| 四 | D1–D3 前端认证状态机 | C2 全绿；手工双标签/断网演练通过 |
| 五 | E1–E4 契约收紧 | C1 新增契约用例全绿；Swagger/文档一致 |
| 六 | F1–F4 工程质量 | 干净机器构建通过；路由分包生效；DESIGN.md 重写完成 |
| — | **然后**才开始第一个真实业务模块 | —— |

**再次明确不做**（第一阶段起持续有效）：RBAC 权限五表、动态表单引擎、工作流引擎、部门岗位体系、租户隔离、Redis 限流存储、Token Family/Device Session、Zod/codegen 契约体系。这些等真实业务提出真实要求后再评估——底座的正确成长方式是「做牢 → 接业务 → 从业务中抽象」，而不是提前画大架构。

---

# 实施记录（v1.1，2026-09-25 完成）

六阶段全部实施并通过验收（API 集成测试 28/28、前端认证层测试 15/15、`pnpm check` 全绿）。实施中对原规格做了以下**技术修正**，均已在代码与文档中体现：

| 编号 | 相对原规格的修正 | 理由 |
| --- | --- | --- |
| A1 | 增加 **30 秒复用宽限期**：撤销 30 秒内的复用视为并发竞争输家（仅 401 不连坐），超过才视为泄露吊销全部 | 若无宽限期，并发输家会命中复用检测，把竞争赢家刚换出的新 token 一并吊销（连坐） |
| A4 | 「最后管理员检查」用 `SELECT ... FOR UPDATE` 悲观锁，而非普通事务内 count | READ COMMITTED 下「先 count 再写入」仍存在并发互改竞态，锁住全部在岗管理员行才能串行化 |
| A5 | **只对 auth 端点限流**（登录 10/分、刷新/登出 30/分），不设全局默认 | 内网全公司常共享出口 IP，全局限流（如 100/分）会误伤正常使用 |
| E2 | email 与 username **一起**小写化（含迁移 SQL 与唯一性语义） | Prisma `@unique` 同样区分大小写，`A@x.com` 与 `a@x.com` 可注册两个账号，与 username 是同一问题 |
| F1 | `prisma.config.ts` 用 `process.env.DATABASE_URL ?? ''` 而非 `env()` 助手 | `env()` 在变量缺失时抛错，会让不需要数据库的 `prisma generate`（及其依赖的 CI 构建）在干净机器上失败 |
| D2 | 刷新失败后**先重读 localStorage** 再判定登出；跨标签同步只用 storage 事件单通道（不加 BroadcastChannel） | 获胜标签页写入新 token 的 storage 事件可能晚于输家的失败处理；双通道本身属过度设计 |
| 阶段〇 | 用 Vitest 测试骨架直接承载（未另做一次性手工回归脚本） | A/A2/A4 的验收标准天然就是测试用例，测试是长期资产，手工脚本是一次性劳动 |

各项完成状态：A1–A5 ✅（含并发/宽限期/authVersion/FOR UPDATE/429 集成测试）；B1–B6 ✅；C1–C3 ✅（`pnpm check` + AGENTS.md）；D1–D3 ✅（错误三分类/错误页/storage 同步/confirmLoading，含 15 项前端测试）；E1–E4 ✅（正则/小写/null 语义/文档措辞）；F1–F3 ✅（build 链、audit 政策、路由拆包）；F4 已按用户要求**回退**——根目录 DESIGN.md 恢复为 ZCode 原版设计系统（用户指定以其为最高 UI 规范），不再使用改写版，ui-mapping.md 负责向 AntD 映射。

收尾补充（同日第二轮）：轮换改为「旧作废+新创建」同事务（create 失败抢占回滚）；新增 `revokedReason`（ROTATED/LOGOUT/PASSWORD_RESET/USER_DISABLED/REUSE_DETECTED，含迁移与测试断言）；client.ts 清空会话前对比重放 token 防误清并发标签新 token；me 刷新（变更目标是本人时 invalidate + refetchOnWindowFocus）；UpdateUserDto.name 补非空校验；CI（GitHub Actions + TEST_DATABASE_URL 覆盖）。
