/**
 * 前后端共享的类型与枚举。
 *
 * 这是唯一的「契约」来源——apps/api 的返回结构必须与这里一致，
 * apps/admin 的请求/解析也以这里为准。字符串值与 Prisma schema 中的
 * 枚举保持一致，接口层直接透传。
 *
 * 用 const 对象 + 字面量联合而非 TS enum：字面量类型可以和 Prisma 生成的
 * 枚举（本质也是字面量联合）互相赋值，序列化行为也更可预期。
 */

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  USER: 'USER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ROLE_VALUES = Object.values(Role);
export const USER_STATUS_VALUES = Object.values(UserStatus);

/** 对外的用户结构（不含 passwordHash，任何接口都不允许返回它） */
export interface UserDTO {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Access Token 有效期（秒） */
  expiresIn: number;
  user: UserDTO;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserDTO;
}

export interface UserPageQuery {
  page?: number;
  pageSize?: number;
  /** 对 用户名/姓名/手机/邮箱 做模糊匹配 */
  keyword?: string;
}

export interface UserPageResult {
  items: UserDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserBody {
  username: string;
  name: string;
  password: string;
  email?: string;
  phone?: string;
  role: Role;
}

export interface UpdateUserBody {
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: Role;
}

export interface UpdateUserStatusBody {
  status: UserStatus;
}

export interface ResetPasswordBody {
  newPassword: string;
}

export type FormFieldType = 'text' | 'number' | 'date' | 'select';
export interface FormField {
  id: string;
  title: string;
  type: FormFieldType;
  group?: string;
  options?: { label: string; value: string }[];
  precision?: number;
  unit?: string;
  width?: number;
  description?: string;
  suffix?: string;
  hidden?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}
export type FormData = Record<string, string | number | null>;
export interface FormDTO {
  id: string;
  title: string;
  description: string | null;
  schema: FormField[];
  /** 是否启用「停车记录」附加录入 */
  parkingEnabled: boolean;
  latestEntryDate: string | null;
  submissionCount: number;
}
export interface FormSubmissionDTO {
  id: string;
  formId: string;
  data: FormData;
  createdAt: string;
  updatedAt: string;
}
export interface FormPageResult {
  items: FormDTO[];
  total: number;
  page: number;
  pageSize: number;
}
export interface FormSubmissionPageResult {
  items: FormSubmissionDTO[];
  total: number;
  page: number;
  pageSize: number;
}
export interface SaveFormSubmissionsBody {
  created: FormData[];
  updated: { id: string; data: FormData }[];
  deleted: string[];
}

/** 上次值接口（USER 可用）：每个字段最近一次非空值及其归属日期 */
export interface FormLastValuesResult {
  [fieldId: string]: { value: string | number; date: string };
}

// ═══════════════════════════════════════════════════════════
// 生产指标（硫酸，差值法）—— 口径参照 b2 production.service
// 产量(D) = 库存(D) − 库存(D−1) + 流出(D)；流出读销售表按四酸独立计算
// ═══════════════════════════════════════════════════════════

/** 单日库存（吨）：按物料分组的快照 */
export interface SulfuricInventory {
  acid98: number;
  fuming: number;
  reagent: number;
  total: number;
}

/** 四酸各自的日流出量（吨），来自销售表 */
export interface SulfuricFlow {
  acid98: number;
  acid93: number;
  reagent: number;
  fuming: number;
}

/** 单日产量（吨，差值法）；93 酸罐不在硫酸表，恒为 0（字段占位） */
export interface SulfuricProduction {
  acid98: number;
  acid93: number;
  reagent: number;
  fuming: number;
  /** 折 98 总量 = 98 + 93 + 试剂 + 发烟×105/98 */
  total98Equivalent: number;
  /** 四酸各自的销售流出量 */
  flow: SulfuricFlow;
  /** 前后两个归属日之间的断天天数：0=连续日报；1=断了1天（产量是多天累计差值+多天累计销售） */
  gapDays: number;
}

/** 单个电表读数差换算的当日用电（千瓦时） */
export interface MeterUsage {
  fieldId: string;
  name: string;
  usage: number;
}

export interface SulfuricDaySummary {
  /** 数据归属日（主日期字段值） */
  date: string;
  /** 当日库存快照；该日罐液位数据不完整为 null */
  inventory: SulfuricInventory | null;
  /** 差值产量；当日或前日液位数据不完整为 null（不把缺罐当 0%） */
  production: SulfuricProduction | null;
  /** 分表电耗 + 合计；同上 */
  electricity: { meters: MeterUsage[]; total: number } | null;
}

export interface SulfuricSummaryResult {
  days: SulfuricDaySummary[];
}

// ═══════════════════════════════════════════════════════════
// 车间版面 / 能源中心 / 物料与库存 —— 读取时现算，不改写表单数据
// ═══════════════════════════════════════════════════════════

/** 一个车间的日产量序列（values 与 dates 一一对应，无数据为 null） */
export interface WorkshopSeries {
  code: 'sulfuric' | 'aminosulfonic' | 'magnesium' | 'hydrotalcite' | 'anthraquinone';
  name: string;
  /** 硫酸为折98吨（差值法现算）；其余车间为表单直接上报产量（吨） */
  unit: string;
  values: Array<number | null>;
}

export interface WorkshopOverviewResult {
  dates: string[];
  workshops: WorkshopSeries[];
}

/** 能源中心的一条日序列（读数差 × 倍率；跨断天为 null 不拆分） */
export interface EnergySeries {
  name: string;
  values: Array<number | null>;
}

export interface EnergyResult {
  dates: string[];
  electricity: {
    /** 各车间日用电 kWh */
    workshops: EnergySeries[];
    /** 1#冷凝机日发电 kWh */
    generation: Array<number | null>;
    /** 2#进线日外购电 kWh */
    purchase: Array<number | null>;
  };
  steam: {
    /** 内供各车间日供汽 t */
    internal: EnergySeries[];
    /** 外供客户日供汽 t */
    external: EnergySeries[];
  };
  water: {
    /** 各车间日用水 t */
    workshops: EnergySeries[];
  };
}

export interface RawMaterialStockItem {
  name: string;
  workshop: string;
  /** 最新库存（吨） */
  stock: number | null;
  /** 当日购入 / 耗用（吨） */
  purchase: number | null;
  consumption: number | null;
  /** 可用天数 = 库存 ÷ 近 7 日平均耗用；无法计算为 null */
  daysOfUse: number | null;
  /** 预警：低于 3 天 / 低于 7 天 */
  alert: 'low3' | 'low7' | null;
}

export interface FinishedProductItem {
  name: string;
  /** 当日产量 / 销量 / 库存（吨） */
  production: number | null;
  sales: number | null;
  stock: number | null;
  /** 产销率 = 销量 ÷ 产量 */
  salesRatio: number | null;
  /** 库存天数 = 库存 ÷ 销量 */
  stockDays: number | null;
}

/** 车间之间的物料往来（一家的副产品是另一家的原料） */
export interface InternalFlowItem {
  from: string;
  to: string;
  material: string;
  /** 当日数量（吨） */
  quantity: number | null;
}

export interface MaterialsResult {
  date: string;
  rawMaterials: RawMaterialStockItem[];
  finishedProducts: FinishedProductItem[];
  internalFlows: InternalFlowItem[];
}

/** 车间版面·库存卡片：按物料分组的最新罐液位 */
export interface TankLevelItem {
  fieldId: string;
  name: string;
  /** 液位 %；未填为 null */
  levelPercent: number | null;
  /** 折算吨 = 液位% × 罐容 × 密度；液位缺失为 null */
  tons: number | null;
  capacity: number;
  density: number;
}

export interface TankMaterialGroup {
  material: string;
  totalTons: number;
  tanks: TankLevelItem[];
}

export interface TankLevelsResult {
  date: string;
  groups: TankMaterialGroup[];
}
