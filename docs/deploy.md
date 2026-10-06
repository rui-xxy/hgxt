# HGXT 服务器部署手册（原生部署，无 Docker）

目标形态：**一个 Node 进程（API + 前端静态文件同端口）+ 本机 PostgreSQL + systemd 守护**。
不装 Docker、不需要 nginx——生产模式下 API 会自动托管 `apps/admin/dist`（见 `apps/api/src/main.ts` 的 `useStaticAssets`），浏览器直接访问 `http://服务器IP:3001/` 即可。

整体内存占用：Node ≈ 150–250 MB + PostgreSQL ≈ 100–200 MB，无其他常驻组件。

> 以下命令以 **Ubuntu/Debian + root（或 sudo）** 为主，CentOS/RHEL 差异见文末附录。
> 所有下载都走国内镜像（npmmirror / 清华 TUNA）。

## 目录

1. [安装 PostgreSQL 18](#1-安装-postgresql-18)
2. [安装 Node.js 24 与 pnpm](#2-安装-nodejs-24-与-pnpm)
3. [创建运行账号并上传代码](#3-创建运行账号并上传代码)
4. [安装依赖并构建](#4-安装依赖并构建)
5. [配置环境变量](#5-配置环境变量)
6. [迁移开发机数据](#6-迁移开发机数据可选-推荐)
7. [注册 systemd 服务](#7-注册-systemd-服务)
8. [验证](#8-验证)
9. [日常运维：升级 / 备份 / 日志](#9-日常运维)
10. [附录](#10-附录)

---

## 1. 安装 PostgreSQL 18

用清华 TUNA 镜像的 PGDG 仓库（Ubuntu/Debian）：

```bash
sudo apt update && sudo apt install -y curl gnupg lsb-release
curl -fsSL https://mirrors.tuna.tsinghua.edu.cn/postgresql/repos/apt/ACCC4CF8.asc \
  | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
echo "deb https://mirrors.tuna.tsinghua.edu.cn/postgresql/repos/apt/ $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt install -y postgresql-18
```

创建应用数据库角色和库（**把 `数据库强密码` 换成你自己的**，后面 `.env` 里要用）：

```bash
sudo -u postgres psql -c "CREATE ROLE hgxt LOGIN PASSWORD '数据库强密码';"
sudo -u postgres psql -c "CREATE DATABASE hgxt OWNER hgxt;"
```

PostgreSQL 默认只监听 `127.0.0.1:5432`，应用同机连接，无需改动任何监听配置。

## 2. 安装 Node.js 24 与 pnpm

从 npmmirror 的 Node 官方二进制镜像安装（与开发机一致的 v24.18.0）：

```bash
cd /tmp
NODE_VER=v24.18.0
curl -LO https://registry.npmmirror.com/-/binary/node/${NODE_VER}/node-${NODE_VER}-linux-x64.tar.xz
sudo mkdir -p /usr/local/node
sudo tar -xJf node-${NODE_VER}-linux-x64.tar.xz -C /usr/local/node --strip-components=1
for b in node npm npx; do sudo ln -sf /usr/local/node/bin/$b /usr/local/bin/$b; done
node -v   # 应输出 v24.18.0

# pnpm（版本与仓库 packageManager 字段锁定的一致），并配置国内 registry
sudo npm install -g pnpm@10.33.0 --registry=https://registry.npmmirror.com
sudo ln -sf /usr/local/node/bin/pnpm /usr/local/bin/pnpm
pnpm -v   # 应输出 10.33.0
```

## 3. 创建运行账号并上传代码

服务器上建专用账号（不用 root 跑业务）：

```bash
sudo useradd -r -m -d /opt/hgxt -s /bin/bash hgxt
```

开发机（Windows，Git Bash）打包并传过去——`git archive` 只含 git 管理的文件，
**不含 `.env`、node_modules 等本机内容**，干净可靠（U 盘拷贝同理）：

```bash
# 开发机（在仓库根目录）
git archive --format=tar.gz -o hgxt-deploy.tar.gz HEAD
scp hgxt-deploy.tar.gz 你的用户名@服务器IP:/tmp/
```

服务器上解压并授权：

```bash
sudo tar -xzf /tmp/hgxt-deploy.tar.gz -C /opt/hgxt
sudo chown -R hgxt:hgxt /opt/hgxt
```

## 4. 安装依赖并构建

```bash
# registry 指向 npmmirror（给 hgxt 账号配置一次即可）
sudo -u hgxt pnpm config set registry https://registry.npmmirror.com

# 安装 + 构建
# 注意：Prisma 引擎二进制从官方 binaries.prisma.sh 下载，阿里云实测直连正常（约 1 秒）。
# 不要设置 PRISMA_ENGINES_MIRROR——npmmirror 的 prisma-engines 镜像缺本版本引擎文件，会 404 构建失败。
cd /opt/hgxt
sudo -u hgxt pnpm install --frozen-lockfile
sudo -u hgxt pnpm build
```

`pnpm build` 会依次产出 `packages/shared/dist` → `apps/api/dist`（含 prisma generate）→ `apps/admin/dist`。

## 5. 配置环境变量

```bash
sudo -u hgxt cp apps/api/.env.example apps/api/.env
sudo -u hgxt vim apps/api/.env    # 或 nano
```

需要改的三处：

```ini
HOST=0.0.0.0
DATABASE_URL="postgresql://hgxt:数据库强密码@127.0.0.1:5432/hgxt?schema=public"
JWT_ACCESS_SECRET="<openssl rand -hex 32 生成的随机串>"
```

> 生成 JWT 密钥：`openssl rand -hex 32`。配置过弱（少于 32 字符或示例值）生产环境会拒绝启动。
> 应用从 `apps/api/.env` 读配置（ConfigModule 自动加载），systemd 只额外注入 `NODE_ENV=production`。

## 6. 迁移开发机数据（可选，推荐）

把开发机现有数据库整体搬到服务器，**上线即有全部历史数据，且无需 seed**。

开发机（Git Bash，docker 里的 hgxt-postgres 得在跑）：

```bash
docker exec hgxt-postgres pg_dump -U postgres -d hgxt -Fc -f /tmp/hgxt.dump
docker cp hgxt-postgres:/tmp/hgxt.dump .
scp hgxt.dump 你的用户名@服务器IP:/tmp/
```

服务器上恢复：

```bash
sudo -u postgres pg_restore -d hgxt --role=hgxt --no-owner --no-privileges /tmp/hgxt.dump
```

校验迁移状态（应显示全部迁移已应用）：

```bash
cd /opt/hgxt/apps/api && sudo -u hgxt pnpm exec prisma migrate status
```

> - 迁移后**登录账号与开发机完全一致**（admin 及其当时的密码）。
> - 不迁数据、从零初始化的路径见[附录](#附录从零初始化不迁数据)。

## 7. 注册 systemd 服务

```bash
sudo cp /opt/hgxt/deploy/hgxt-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hgxt-api    # 启动并设置开机自启
systemctl status hgxt-api
```

## 8. 验证

服务器本机：

```bash
curl -I http://127.0.0.1:3001/            # 200，text/html（前端入口）
curl -i http://127.0.0.1:3001/api/auth/me # 401（未带 token，说明 API 正常）
```

放行防火墙后用浏览器访问 `http://服务器IP:3001/` 登录：

```bash
# Ubuntu（ufw）
sudo ufw allow 3001/tcp
# CentOS（firewalld）
sudo firewall-cmd --add-port=3001/tcp --permanent && sudo firewall-cmd --reload
```

## 9. 日常运维

```bash
journalctl -u hgxt-api -f          # 实时日志
sudo systemctl restart hgxt-api    # 重启（改完 .env 后执行）
```

**升级版本**（开发机发新版 → 服务器更新）：

```bash
# 开发机
git archive --format=tar.gz -o hgxt-deploy.tar.gz HEAD
scp hgxt-deploy.tar.gz 你的用户名@服务器IP:/tmp/

# 服务器（.env 不在包里，解压覆盖不会动它）
cd /opt/hgxt && sudo tar -xzf /tmp/hgxt-deploy.tar.gz
sudo -u hgxt pnpm install --frozen-lockfile
sudo -u hgxt pnpm build
cd apps/api && sudo -u hgxt pnpm exec prisma migrate deploy   # 有新迁移时执行
sudo systemctl restart hgxt-api
```

**每日备份**（root 的 crontab，`sudo crontab -e` 加一行，每天 2:30 备份并保留 14 天）：

```
30 2 * * * sudo -u postgres pg_dump -d hgxt -Fc -f /var/backups/hgxt-$(date +\%F).dump && find /var/backups -name 'hgxt-*.dump' -mtime +14 -delete
```

恢复备份：`pg_restore -d hgxt --role=hgxt --no-owner /var/backups/hgxt-某日期.dump`（先清空或重建库）。

## 10. 附录

### 附录：从零初始化（不迁数据）

```bash
cd /opt/hgxt/apps/api
sudo -u hgxt pnpm exec prisma migrate deploy
sudo -u hgxt env SEED_ADMIN_PASSWORD='初始管理员密码(至少8位)' pnpm exec tsx prisma/seed.ts
# 需要仓库内置的历史数据时再按需导入：
#   pnpm db:import-matters / db:import-anthraquinone / db:import-fenglian
#   / db:import-sulfuric-control / db:import-maintenance / db:import-legacy
```

### 附录：CentOS / RHEL 差异

- PostgreSQL：PGDG 的 yum 仓同样有清华镜像
  （`https://mirrors.tuna.tsinghua.edu.cn/postgresql/repos/yum/`），装 `postgresql18-server` 后 `postgresql-setup --initdb`；
- 防火墙用 firewalld（命令见第 8 节）；
- 其余步骤完全一致。

### 附录：想用 80 端口

Linux 普通用户不能绑 1024 以下端口，两种办法任选：

```bash
# 办法一：给 node 二进制加 capability（改 .env 里 PORT=80 后重启服务）
sudo setcap 'cap_net_bind_service=+ep' /usr/local/node/bin/node
# 办法二：日后用户多了再上 nginx 反代 80 → 3001（届时 .env 加 TRUST_PROXY=1）
```

### 附录：生产环境开 Swagger

`.env` 加 `ENABLE_SWAGGER=true` 后重启，访问 `http://服务器IP:3001/api/docs`。
注意：生产 CSP 较严，Swagger UI 可能因内联脚本被拦而显示异常——调试完建议关掉。

### 附录：账号安全提醒

- `JWT_ACCESS_SECRET` 与数据库密码不要复用、不要提交进 git；
- 上线后第一时间把开发期默认的管理员密码改掉。
