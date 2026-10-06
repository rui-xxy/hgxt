import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateUserBody,
  UpdateUserBody,
  UserDTO,
  UserPageQuery,
  UserPageResult,
  UserStatus,
  Role,
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { hashPassword } from '../common/utils/argon';
import { isRecordNotFound, isUniqueViolation } from '../common/utils/prisma-errors';
import { toUserDTO } from './user.mapper';

/** E2：用户名统一小写存储，唯一性与登录都不区分大小写 */
function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UserPageQuery): Promise<UserPageResult> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const keyword = query.keyword?.trim();

    const where: Prisma.UserWhereInput = keyword
      ? {
          OR: [
            { username: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } },
            { phone: { contains: keyword, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items.map(toUserDTO), total, page, pageSize };
  }

  async findOne(id: string): Promise<UserDTO> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return toUserDTO(user);
  }

  async create(dto: CreateUserBody): Promise<UserDTO> {
    // Argon2 哈希是 CPU 密集操作，在事务外完成（A3：不占事务时长）
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          username: normalizeUsername(dto.username),
          name: dto.name.trim(),
          phone: dto.phone?.trim() || null,
          passwordHash,
          role: dto.role,
          pagePermissions: dto.pagePermissions ?? [],
        },
      });
      return toUserDTO(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('用户名已被占用（不区分大小写）');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserBody): Promise<UserDTO> {
    try {
      // A4：降级最后一个管理员的检查必须与写入同事务
      return await this.prisma.$transaction(async (tx) => {
        await assertNotLastActiveSuperAdmin(tx, id, { role: dto.role });
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            // E3 语义：undefined = 不修改；null = 清空；string = 设置值
            ...(dto.phone !== undefined && { phone: dto.phone === null ? null : dto.phone.trim() }),
            ...(dto.role !== undefined && { role: dto.role }),
            ...(dto.pagePermissions !== undefined && { pagePermissions: dto.pagePermissions }),
          },
        });
        return toUserDTO(user);
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (isRecordNotFound(error)) throw new NotFoundException('用户不存在');
      throw error;
    }
  }

  async updateStatus(id: string, status: UserStatus, currentUserId: string): Promise<UserDTO> {
    if (id === currentUserId && status === 'DISABLED') {
      throw new BadRequestException('不能禁用当前登录的账号');
    }

    try {
      // A3：禁用 + 踢下线必须同事务；A4：不能禁用最后一个管理员
      return await this.prisma.$transaction(async (tx) => {
        await assertNotLastActiveSuperAdmin(tx, id, { status });
        const user = await tx.user.update({ where: { id }, data: { status } });
        if (status === 'DISABLED') {
          await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date(), revokedReason: 'USER_DISABLED' },
          });
        }
        return toUserDTO(user);
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (isRecordNotFound(error)) throw new NotFoundException('用户不存在');
      throw error;
    }
  }

  async resetPassword(id: string, newPassword: string): Promise<UserDTO> {
    const passwordHash = await hashPassword(newPassword);
    try {
      // A2 + A3：改哈希、authVersion+1、吊销全部会话，一个事务内完成，
      // 任一步失败全部回滚，不存在「密码改了但会话还在」的半成功状态
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: { passwordHash, authVersion: { increment: 1 } },
        });
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
        });
        return toUserDTO(user);
      });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('用户不存在');
      throw error;
    }
  }

  /**
   * 删除用户：RefreshToken 级联删（schema onDelete: Cascade），
   * FormSubmission 的 submitterId 置空（onDelete: SetNull）——数据保留，提交人变"已删除"。
   * 保护：不能删自己；不能删最后一个 ACTIVE SUPER_ADMIN（复用 A4 的 FOR UPDATE 检查）。
   */
  async remove(id: string, currentUserId: string): Promise<{ success: true }> {
    if (id === currentUserId) {
      throw new BadRequestException('不能删除当前登录的账号');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true } });
        if (!target) throw new NotFoundException('用户不存在');
        if (target.role === 'SUPER_ADMIN') {
          await assertNotLastActiveSuperAdmin(tx, id, { status: 'DISABLED' });
        }
        await tx.user.delete({ where: { id } });
      });
      return { success: true };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      if (isRecordNotFound(error)) throw new NotFoundException('用户不存在');
      throw error;
    }
  }
}

/**
 * A4 系统级不变量：任何时刻 ACTIVE SUPER_ADMIN ≥ 1。
 *
 * 注意普通事务（READ COMMITTED）下「先 count 再写入」存在竞态：
 * 两个管理员并发互改时可能都读到「还剩 1 个」而双双放行。
 * 因此先 `SELECT ... FOR UPDATE` 锁住全部在岗管理员行再计数——
 * 并发操作会在锁上串行化，后到者必然看到前者的修改结果。
 */
async function assertNotLastActiveSuperAdmin(
  tx: Prisma.TransactionClient,
  targetId: string,
  next: { role?: Role; status?: UserStatus },
): Promise<void> {
  const target = await tx.user.findUnique({ where: { id: targetId } });
  if (!target) throw new NotFoundException('用户不存在');

  const losesAdmin =
    (next.role !== undefined && target.role === 'SUPER_ADMIN' && next.role !== 'SUPER_ADMIN') ||
    (next.status === 'DISABLED' && target.role === 'SUPER_ADMIN');
  if (!losesAdmin) return;

  await tx.$executeRaw`SELECT "id" FROM "User" WHERE "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE' FOR UPDATE`;

  const remaining = await tx.user.count({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: targetId } },
  });
  if (remaining === 0) {
    throw new BadRequestException('系统至少需要保留一个启用状态的管理员');
  }
}
