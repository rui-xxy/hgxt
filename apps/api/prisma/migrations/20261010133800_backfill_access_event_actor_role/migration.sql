-- 以当前用户角色标记既有事件；查询层据此排除超级管理员的历史足迹。
UPDATE "AccessEvent" AS event
SET "actorRole" = actor.role
FROM "User" AS actor
WHERE event."userId" = actor.id
  AND event."actorRole" IS NULL;
