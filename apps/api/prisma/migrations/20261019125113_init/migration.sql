-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(22) NOT NULL,
    "managementTokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapturedRequest" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "method" VARCHAR(7) NOT NULL,
    "headers" JSONB NOT NULL,
    "query" JSONB NOT NULL,
    "body" BYTEA NOT NULL,
    "contentType" TEXT,
    "sourceIp" VARCHAR(45),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapturedRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_slug_key" ON "WebhookEndpoint"("slug");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_expiresAt_idx" ON "WebhookEndpoint"("expiresAt");

-- CreateIndex
CREATE INDEX "CapturedRequest_endpointId_receivedAt_id_idx" ON "CapturedRequest"("endpointId", "receivedAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "CapturedRequest" ADD CONSTRAINT "CapturedRequest_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
