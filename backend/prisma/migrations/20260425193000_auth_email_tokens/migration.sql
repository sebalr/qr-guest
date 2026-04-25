ALTER TABLE "users"
ALTER COLUMN "password_hash" DROP NOT NULL,
ADD COLUMN "email_verified_at" TIMESTAMP(3);

CREATE TABLE "user_auth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_auth_tokens_token_hash_key" ON "user_auth_tokens"("token_hash");
CREATE INDEX "user_auth_tokens_user_id_type_consumed_at_idx" ON "user_auth_tokens"("user_id", "type", "consumed_at");

ALTER TABLE "user_auth_tokens"
ADD CONSTRAINT "user_auth_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
