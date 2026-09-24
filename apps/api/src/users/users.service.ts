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
} from '@hgxt/shared';
import { PrismaService } from '../database/prisma.service';
import { hashPassword } from '../common/utils/argon';
import { isRecordNotFound, isUniqueViolation } from '../common/utils/prisma-errors';
import { toUserDTO } from './user.mapper';
import type { Prisma } from '../generated/prisma/client';

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
            { email: { contains: keyword, mode: 'insensitive' } },
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
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          name: dto.name,
          email: dto.email || null,
          phone: dto.phone || null,
          passwordHash,
          role: dto.role,
        },
      });
      return toUserDTO(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('用户名或邮箱已被占用');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserBody): Promise<UserDTO> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          // 空字符串表示清空可选字段
          ...(dto.email !== undefined && { email: dto.email || null }),
          ...(dto.phone !== undefined && { phone: dto.phone || null }),
          ...(dto.role !== undefined && { role: dto.role }),
        },
      });
      return toUserDTO(user);
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('用户不存在');
      if (isUniqueViolation(error)) throw new ConflictException('邮箱已被占用');
      throw error;
    }
  }

  async updateStatus(id: string, status: UserStatus, currentUserId: string): Promise<UserDTO> {
    if (id === currentUserId && status === 'DISABLED') {
      throw new BadRequestException('不能禁用当前登录的账号');
    }

    try {
      const user = await this.prisma.user.update({ where: { id }, data: { status } });
      if (status === 'DISABLED') {
        // 禁用后立即踢下线：吊销该用户全部会话
        await this.prisma.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return toUserDTO(user);
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('用户不存在');
      throw error;
    }
  }

  async resetPassword(id: string, newPassword: string): Promise<UserDTO> {
    const passwordHash = await hashPassword(newPassword);
    try {
      const user = await this.prisma.user.update({ where: { id }, data: { passwordHash } });
      // 密码重置后旧会话全部失效
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return toUserDTO(user);
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('用户不存在');
      throw error;
    }
  }
}
