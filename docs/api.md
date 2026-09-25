# HGXT API 概览（V1）

交互式文档（Swagger UI）：**http://localhost:3001/api/docs**（生产环境默认关闭，需 `ENABLE_SWAGGER=true`；可在页面上 Authorize 填 Bearer Token 调试）。

- Base URL：`/api`
- 认证：`Authorization: Bearer <accessToken>`（Access Token 15 分钟；过期后用 refresh 换新）
- 错误结构：`{ "statusCode": 4xx/5xx, "message": "中文错误信息", "error": "HttpError" }`；参数校验失败（400）时 `message` 为数组
- 限流：同 IP 每分钟登录 10 次、刷新/登出 30 次；超限返回 429「请求过于频繁，请稍后再试」

## auth 认证（公开接口）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录，返回 accessToken / refreshToken / user。**用户名不区分大小写** |
| POST | `/api/auth/refresh` | 原子轮换：同一旧 token 只有一个请求成功（并发输家 401）；已作废 token 超过 30 秒被复用会吊销该用户全部会话 |
| POST | `/api/auth/logout` | 作废传入的 refresh token（幂等） |
| GET | `/api/auth/me` | 当前登录用户（需 Bearer） |

## users 用户管理（仅 SUPER_ADMIN）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/users?page&pageSize&keyword` | 分页列表；keyword 模糊匹配 用户名/姓名/手机/邮箱（不区分大小写），按创建时间倒序 |
| GET | `/api/users/:id` | 用户详情 |
| POST | `/api/users` | 新增用户：username 需匹配 `^[a-zA-Z0-9_-]{2,64}$`（入库统一小写、不区分大小写唯一）；密码 ≥8 位；email 同样统一小写 |
| PATCH | `/api/users/:id` | 编辑。可空字段 PATCH 语义：**缺省=不修改，null=清空，字符串=设置值**。不能降级最后一个管理员 |
| PATCH | `/api/users/:id/status` | ACTIVE ↔ DISABLED；禁用即踢下线；不能禁用自己；不能禁用最后一个管理员 |
| POST | `/api/users/:id/reset-password` | 重置密码：**旧 Access Token 与 Refresh Token 全部立即失效**（authVersion+1） |

**没有 DELETE 用户接口**——员工离职走禁用，保留业务数据的引用完整性（设计取舍见 docs/architecture.md）。

所有用户接口永不返回 `passwordHash`。
