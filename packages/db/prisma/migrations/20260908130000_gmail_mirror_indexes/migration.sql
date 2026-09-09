CREATE INDEX "emailMessage_gmailThreadId_idx" ON "emailMessage"("gmailThreadId");

CREATE INDEX "emailMessage_labelIds_idx" ON "emailMessage" USING GIN ("labelIds");
