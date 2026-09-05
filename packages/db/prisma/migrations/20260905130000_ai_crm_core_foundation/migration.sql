CREATE TYPE "BusinessUnitStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS', 'TELEGRAM', 'INSTAGRAM', 'FACEBOOK', 'WEB_FORM', 'PHONE_CALL', 'INTERNAL', 'OTHER');
CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL', 'UNKNOWN');
CREATE TYPE "CommunicationParticipantRole" AS ENUM ('SENDER', 'RECIPIENT', 'CC', 'BCC', 'PARTICIPANT');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WAITING_ON_CUSTOMER', 'WAITING_ON_US', 'RESOLVED', 'ARCHIVED');
CREATE TYPE "ConversationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "AiProcessingStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'PROCESSING', 'COMPLETE', 'NEEDS_REVIEW', 'FAILED');
CREATE TYPE "CustomerIdentityKind" AS ENUM ('EMAIL', 'PHONE', 'SOCIAL_HANDLE', 'CHANNEL_PROFILE', 'EXTERNAL_ID', 'OTHER');
CREATE TYPE "CustomerIdentityStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'MERGED', 'IGNORED');
CREATE TYPE "BusinessEventSource" AS ENUM ('CRM', 'GMAIL', 'OUTLOOK', 'CALENDAR', 'WEBSITE', 'AGENT', 'AUTOMATION', 'N8N', 'SYSTEM', 'OTHER');
CREATE TYPE "AgentKind" AS ENUM ('CUSTOMER_SERVICE', 'SALES', 'BOOKING', 'FINANCE', 'MARKETING', 'OPERATIONS', 'EXECUTIVE', 'CUSTOM');
CREATE TYPE "AgentPermissionScope" AS ENUM ('READ', 'PROPOSE', 'EXECUTE', 'SEND', 'FINANCIAL', 'ADMIN');
CREATE TYPE "AgentDecisionStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "ApprovalRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "KnowledgeItemType" AS ENUM ('PRICING', 'TRAVEL_FEE', 'SERVICE', 'PACKAGE', 'PROMOTION', 'PAYMENT', 'CANCELLATION', 'BOOKING', 'OPERATIONS', 'FAQ', 'POLICY', 'STAFF_INSTRUCTION', 'OTHER');
CREATE TYPE "KnowledgeVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "MemoryProvider" AS ENUM ('MEMO', 'OTHER');
CREATE TYPE "MemoryEntityType" AS ENUM ('CONTACT', 'COMPANY', 'DEAL', 'BOOKING', 'CONVERSATION', 'MESSAGE', 'BUSINESS_EVENT', 'KNOWLEDGE_ITEM', 'AGENT_ACTION', 'OTHER');
CREATE TYPE "BusinessEventOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "BusinessTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED');
CREATE TYPE "BusinessTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "BusinessTaskAssigneeType" AS ENUM ('HUMAN', 'AGENT');
CREATE TYPE "AutomationRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED');

ALTER TABLE "appSetting" ADD COLUMN "aiAutomationKillSwitch" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "businessUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "BusinessUnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "businessUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channelAccount" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "userId" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "channelAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customerIdentity" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "kind" "CustomerIdentityKind" NOT NULL,
    "channel" "CommunicationChannel",
    "value" TEXT NOT NULL,
    "externalId" TEXT,
    "label" TEXT,
    "status" "CustomerIdentityStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customerIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "channelAccountId" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ConversationPriority" NOT NULL DEFAULT 'NORMAL',
    "subject" TEXT,
    "preview" TEXT,
    "externalThreadId" TEXT,
    "emailThreadId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "assignedOwnerId" TEXT,
    "assignedAgentId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "aiProcessingStatus" "AiProcessingStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communicationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "direction" "CommunicationDirection" NOT NULL,
    "sender" JSONB NOT NULL,
    "recipients" JSONB NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "snippet" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "externalMessageId" TEXT,
    "providerMessageId" TEXT,
    "emailMessageId" TEXT,
    "aiProcessingStatus" "AiProcessingStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "attachments" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communicationMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communicationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "customerIdentityId" TEXT,
    "contactId" TEXT,
    "role" "CommunicationParticipantRole" NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communicationParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversationInsight" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "intent" TEXT,
    "summary" TEXT,
    "sentiment" TEXT,
    "urgency" TEXT,
    "services" JSONB,
    "eventDate" DATE,
    "eventTime" TEXT,
    "durationMinutes" INTEGER,
    "location" TEXT,
    "quotedAmount" DECIMAL(14,2),
    "quotedCurrency" TEXT,
    "promises" JSONB,
    "objections" JSONB,
    "nextAction" TEXT,
    "confidence" DOUBLE PRECISION,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "model" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversationInsight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "businessEvent" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "type" TEXT NOT NULL,
    "source" "BusinessEventSource" NOT NULL,
    "channel" "CommunicationChannel",
    "actorType" TEXT,
    "actorId" TEXT,
    "actorUserId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "correlationId" TEXT,
    "causationId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "businessEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "businessEventOutbox" (
    "id" TEXT NOT NULL,
    "businessEventId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "BusinessEventOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "businessEventOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentCapability" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agentCapability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentPermission" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "scope" "AgentPermissionScope" NOT NULL,
    "target" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agentPermission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agentRun" ADD COLUMN "businessEventId" TEXT;

CREATE TABLE "agentDecision" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB,
    "confidence" DOUBLE PRECISION,
    "riskLevel" "ApprovalRiskLevel",
    "status" "AgentDecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agentDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approvalRequest" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "requestedByAgentId" TEXT,
    "runId" TEXT,
    "businessEventId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "proposedAction" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "riskLevel" "ApprovalRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approvalRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agentAction" ADD COLUMN "beforeState" JSONB;
ALTER TABLE "agentAction" ADD COLUMN "requestedPayload" JSONB;
ALTER TABLE "agentAction" ADD COLUMN "actualResult" JSONB;
ALTER TABLE "agentAction" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "agentAction" ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agentAction" ADD COLUMN "approvalRequestId" TEXT;
ALTER TABLE "agentAction" ADD COLUMN "evidenceReferences" JSONB;

CREATE TABLE "knowledgeItem" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "type" "KnowledgeItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledgeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledgeVersion" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "KnowledgeVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT,
    "data" JSONB,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledgeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "businessRule" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "knowledgeItemId" TEXT,
    "type" "KnowledgeItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "businessRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "externalMemoryLink" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "businessEventId" TEXT,
    "knowledgeItemId" TEXT,
    "provider" "MemoryProvider" NOT NULL,
    "externalMemoryId" TEXT NOT NULL,
    "entityType" "MemoryEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "indexedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "externalMemoryLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "businessTask" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "ownerId" TEXT,
    "assigneeType" "BusinessTaskAssigneeType" NOT NULL DEFAULT 'HUMAN',
    "assignedUserId" TEXT,
    "assignedAgentId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "bookingId" TEXT,
    "conversationId" TEXT,
    "sourceEventId" TEXT,
    "parentTaskId" TEXT,
    "agentRunId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "BusinessTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "BusinessTaskStatus" NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "result" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "businessTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automationRule" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automationExecution" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "businessEventId" TEXT,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automationExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agentSafetyPolicy" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "agentId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "automaticSending" BOOLEAN NOT NULL DEFAULT false,
    "maxActionsPerHour" INTEGER NOT NULL DEFAULT 10,
    "maxActionsPerDay" INTEGER NOT NULL DEFAULT 50,
    "approvalThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "riskThreshold" "ApprovalRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "financialActions" BOOLEAN NOT NULL DEFAULT false,
    "allowedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedChannels" "CommunicationChannel"[] DEFAULT ARRAY[]::"CommunicationChannel"[],
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agentSafetyPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "businessUnit_slug_key" ON "businessUnit"("slug");
CREATE INDEX "businessUnit_status_name_idx" ON "businessUnit"("status", "name");
CREATE UNIQUE INDEX "channelAccount_provider_externalAccountId_key" ON "channelAccount"("provider", "externalAccountId");
CREATE INDEX "channelAccount_businessUnitId_channel_idx" ON "channelAccount"("businessUnitId", "channel");
CREATE INDEX "channelAccount_userId_channel_idx" ON "channelAccount"("userId", "channel");
CREATE UNIQUE INDEX "customerIdentity_businessUnitId_kind_value_key" ON "customerIdentity"("businessUnitId", "kind", "value");
CREATE INDEX "customerIdentity_contactId_idx" ON "customerIdentity"("contactId");
CREATE INDEX "customerIdentity_companyId_idx" ON "customerIdentity"("companyId");
CREATE INDEX "customerIdentity_channel_externalId_idx" ON "customerIdentity"("channel", "externalId");
CREATE UNIQUE INDEX "conversation_emailThreadId_key" ON "conversation"("emailThreadId");
CREATE UNIQUE INDEX "conversation_channel_externalThreadId_key" ON "conversation"("channel", "externalThreadId");
CREATE INDEX "conversation_businessUnitId_lastMessageAt_idx" ON "conversation"("businessUnitId", "lastMessageAt");
CREATE INDEX "conversation_channel_status_lastMessageAt_idx" ON "conversation"("channel", "status", "lastMessageAt");
CREATE INDEX "conversation_contactId_lastMessageAt_idx" ON "conversation"("contactId", "lastMessageAt");
CREATE INDEX "conversation_companyId_lastMessageAt_idx" ON "conversation"("companyId", "lastMessageAt");
CREATE INDEX "conversation_dealId_lastMessageAt_idx" ON "conversation"("dealId", "lastMessageAt");
CREATE INDEX "conversation_bookingId_lastMessageAt_idx" ON "conversation"("bookingId", "lastMessageAt");
CREATE UNIQUE INDEX "communicationMessage_emailMessageId_key" ON "communicationMessage"("emailMessageId");
CREATE UNIQUE INDEX "communicationMessage_channel_providerMessageId_key" ON "communicationMessage"("channel", "providerMessageId");
CREATE INDEX "communicationMessage_conversationId_sentAt_idx" ON "communicationMessage"("conversationId", "sentAt");
CREATE INDEX "communicationMessage_channel_sentAt_idx" ON "communicationMessage"("channel", "sentAt");
CREATE INDEX "communicationParticipant_conversationId_role_idx" ON "communicationParticipant"("conversationId", "role");
CREATE INDEX "communicationParticipant_messageId_role_idx" ON "communicationParticipant"("messageId", "role");
CREATE INDEX "communicationParticipant_contactId_idx" ON "communicationParticipant"("contactId");
CREATE INDEX "communicationParticipant_customerIdentityId_idx" ON "communicationParticipant"("customerIdentityId");
CREATE INDEX "conversationInsight_conversationId_createdAt_idx" ON "conversationInsight"("conversationId", "createdAt");
CREATE INDEX "conversationInsight_needsHumanReview_createdAt_idx" ON "conversationInsight"("needsHumanReview", "createdAt");
CREATE INDEX "conversationInsight_intent_createdAt_idx" ON "conversationInsight"("intent", "createdAt");
CREATE UNIQUE INDEX "businessEvent_idempotencyKey_key" ON "businessEvent"("idempotencyKey");
CREATE INDEX "businessEvent_businessUnitId_occurredAt_idx" ON "businessEvent"("businessUnitId", "occurredAt");
CREATE INDEX "businessEvent_type_occurredAt_idx" ON "businessEvent"("type", "occurredAt");
CREATE INDEX "businessEvent_source_occurredAt_idx" ON "businessEvent"("source", "occurredAt");
CREATE INDEX "businessEvent_contactId_occurredAt_idx" ON "businessEvent"("contactId", "occurredAt");
CREATE INDEX "businessEvent_companyId_occurredAt_idx" ON "businessEvent"("companyId", "occurredAt");
CREATE INDEX "businessEvent_dealId_occurredAt_idx" ON "businessEvent"("dealId", "occurredAt");
CREATE INDEX "businessEvent_bookingId_occurredAt_idx" ON "businessEvent"("bookingId", "occurredAt");
CREATE INDEX "businessEvent_conversationId_occurredAt_idx" ON "businessEvent"("conversationId", "occurredAt");
CREATE INDEX "businessEvent_messageId_occurredAt_idx" ON "businessEvent"("messageId", "occurredAt");
CREATE INDEX "businessEvent_correlationId_idx" ON "businessEvent"("correlationId");
CREATE UNIQUE INDEX "businessEventOutbox_businessEventId_destination_key" ON "businessEventOutbox"("businessEventId", "destination");
CREATE INDEX "businessEventOutbox_status_nextAttemptAt_idx" ON "businessEventOutbox"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "agentCapability_agentId_key_key" ON "agentCapability"("agentId", "key");
CREATE INDEX "agentCapability_enabled_key_idx" ON "agentCapability"("enabled", "key");
CREATE UNIQUE INDEX "agentPermission_agentId_scope_target_key" ON "agentPermission"("agentId", "scope", "target");
CREATE INDEX "agentPermission_scope_allowed_idx" ON "agentPermission"("scope", "allowed");
CREATE INDEX "agentRun_businessEventId_idx" ON "agentRun"("businessEventId");
CREATE INDEX "agentDecision_agentId_createdAt_idx" ON "agentDecision"("agentId", "createdAt");
CREATE INDEX "agentDecision_runId_createdAt_idx" ON "agentDecision"("runId", "createdAt");
CREATE INDEX "agentDecision_status_createdAt_idx" ON "agentDecision"("status", "createdAt");
CREATE INDEX "approvalRequest_businessUnitId_status_createdAt_idx" ON "approvalRequest"("businessUnitId", "status", "createdAt");
CREATE INDEX "approvalRequest_requestedByAgentId_createdAt_idx" ON "approvalRequest"("requestedByAgentId", "createdAt");
CREATE INDEX "approvalRequest_runId_createdAt_idx" ON "approvalRequest"("runId", "createdAt");
CREATE INDEX "approvalRequest_contactId_createdAt_idx" ON "approvalRequest"("contactId", "createdAt");
CREATE INDEX "approvalRequest_companyId_createdAt_idx" ON "approvalRequest"("companyId", "createdAt");
CREATE INDEX "approvalRequest_dealId_createdAt_idx" ON "approvalRequest"("dealId", "createdAt");
CREATE INDEX "approvalRequest_bookingId_createdAt_idx" ON "approvalRequest"("bookingId", "createdAt");
CREATE INDEX "approvalRequest_conversationId_createdAt_idx" ON "approvalRequest"("conversationId", "createdAt");
CREATE INDEX "agentAction_approvalRequestId_idx" ON "agentAction"("approvalRequestId");
CREATE INDEX "knowledgeItem_businessUnitId_type_active_idx" ON "knowledgeItem"("businessUnitId", "type", "active");
CREATE INDEX "knowledgeItem_title_idx" ON "knowledgeItem"("title");
CREATE UNIQUE INDEX "knowledgeVersion_knowledgeItemId_version_key" ON "knowledgeVersion"("knowledgeItemId", "version");
CREATE INDEX "knowledgeVersion_status_effectiveFrom_idx" ON "knowledgeVersion"("status", "effectiveFrom");
CREATE INDEX "businessRule_businessUnitId_type_active_idx" ON "businessRule"("businessUnitId", "type", "active");
CREATE INDEX "businessRule_knowledgeItemId_idx" ON "businessRule"("knowledgeItemId");
CREATE UNIQUE INDEX "externalMemoryLink_provider_externalMemoryId_key" ON "externalMemoryLink"("provider", "externalMemoryId");
CREATE UNIQUE INDEX "externalMemoryLink_provider_entityType_entityId_key" ON "externalMemoryLink"("provider", "entityType", "entityId");
CREATE INDEX "externalMemoryLink_businessUnitId_entityType_idx" ON "externalMemoryLink"("businessUnitId", "entityType");
CREATE INDEX "externalMemoryLink_businessEventId_idx" ON "externalMemoryLink"("businessEventId");
CREATE INDEX "businessTask_businessUnitId_status_dueAt_idx" ON "businessTask"("businessUnitId", "status", "dueAt");
CREATE INDEX "businessTask_assignedUserId_status_dueAt_idx" ON "businessTask"("assignedUserId", "status", "dueAt");
CREATE INDEX "businessTask_assignedAgentId_status_dueAt_idx" ON "businessTask"("assignedAgentId", "status", "dueAt");
CREATE INDEX "businessTask_contactId_status_idx" ON "businessTask"("contactId", "status");
CREATE INDEX "businessTask_companyId_status_idx" ON "businessTask"("companyId", "status");
CREATE INDEX "businessTask_dealId_status_idx" ON "businessTask"("dealId", "status");
CREATE INDEX "businessTask_bookingId_status_idx" ON "businessTask"("bookingId", "status");
CREATE INDEX "businessTask_conversationId_status_idx" ON "businessTask"("conversationId", "status");
CREATE INDEX "businessTask_sourceEventId_idx" ON "businessTask"("sourceEventId");
CREATE INDEX "automationRule_businessUnitId_status_priority_idx" ON "automationRule"("businessUnitId", "status", "priority");
CREATE INDEX "automationRule_triggerType_status_idx" ON "automationRule"("triggerType", "status");
CREATE INDEX "automationExecution_ruleId_createdAt_idx" ON "automationExecution"("ruleId", "createdAt");
CREATE INDEX "automationExecution_businessEventId_createdAt_idx" ON "automationExecution"("businessEventId", "createdAt");
CREATE INDEX "automationExecution_status_createdAt_idx" ON "automationExecution"("status", "createdAt");
CREATE UNIQUE INDEX "agentSafetyPolicy_businessUnitId_agentId_key" ON "agentSafetyPolicy"("businessUnitId", "agentId");
CREATE INDEX "agentSafetyPolicy_agentId_enabled_idx" ON "agentSafetyPolicy"("agentId", "enabled");

ALTER TABLE "businessUnit" ADD CONSTRAINT "businessUnit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "channelAccount" ADD CONSTRAINT "channelAccount_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "channelAccount" ADD CONSTRAINT "channelAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customerIdentity" ADD CONSTRAINT "customerIdentity_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customerIdentity" ADD CONSTRAINT "customerIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customerIdentity" ADD CONSTRAINT "customerIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "channelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "emailThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignedOwnerId_fkey" FOREIGN KEY ("assignedOwnerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "agentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communicationMessage" ADD CONSTRAINT "communicationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communicationMessage" ADD CONSTRAINT "communicationMessage_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "emailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communicationParticipant" ADD CONSTRAINT "communicationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communicationParticipant" ADD CONSTRAINT "communicationParticipant_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "communicationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communicationParticipant" ADD CONSTRAINT "communicationParticipant_customerIdentityId_fkey" FOREIGN KEY ("customerIdentityId") REFERENCES "customerIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communicationParticipant" ADD CONSTRAINT "communicationParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversationInsight" ADD CONSTRAINT "conversationInsight_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversationInsight" ADD CONSTRAINT "conversationInsight_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "communicationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversationInsight" ADD CONSTRAINT "conversationInsight_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversationInsight" ADD CONSTRAINT "conversationInsight_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversationInsight" ADD CONSTRAINT "conversationInsight_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversationInsight" ADD CONSTRAINT "conversationInsight_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEvent" ADD CONSTRAINT "businessEvent_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEvent" ADD CONSTRAINT "businessEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEvent" ADD CONSTRAINT "businessEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEvent" ADD CONSTRAINT "businessEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEvent" ADD CONSTRAINT "businessEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEvent" ADD CONSTRAINT "businessEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEvent" ADD CONSTRAINT "businessEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "communicationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessEventOutbox" ADD CONSTRAINT "businessEventOutbox_businessEventId_fkey" FOREIGN KEY ("businessEventId") REFERENCES "businessEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentCapability" ADD CONSTRAINT "agentCapability_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentPermission" ADD CONSTRAINT "agentPermission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentRun" ADD CONSTRAINT "agentRun_businessEventId_fkey" FOREIGN KEY ("businessEventId") REFERENCES "businessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentDecision" ADD CONSTRAINT "agentDecision_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentDecision" ADD CONSTRAINT "agentDecision_runId_agentId_fkey" FOREIGN KEY ("runId", "agentId") REFERENCES "agentRun"("id", "agentId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_requestedByAgentId_fkey" FOREIGN KEY ("requestedByAgentId") REFERENCES "agentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_businessEventId_fkey" FOREIGN KEY ("businessEventId") REFERENCES "businessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "communicationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvalRequest" ADD CONSTRAINT "approvalRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentAction" ADD CONSTRAINT "agentAction_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "approvalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledgeItem" ADD CONSTRAINT "knowledgeItem_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledgeVersion" ADD CONSTRAINT "knowledgeVersion_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledgeVersion" ADD CONSTRAINT "knowledgeVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledgeVersion" ADD CONSTRAINT "knowledgeVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessRule" ADD CONSTRAINT "businessRule_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessRule" ADD CONSTRAINT "businessRule_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessRule" ADD CONSTRAINT "businessRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "externalMemoryLink" ADD CONSTRAINT "externalMemoryLink_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "externalMemoryLink" ADD CONSTRAINT "externalMemoryLink_businessEventId_fkey" FOREIGN KEY ("businessEventId") REFERENCES "businessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "externalMemoryLink" ADD CONSTRAINT "externalMemoryLink_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "agentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "businessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "businessTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businessTask" ADD CONSTRAINT "businessTask_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automationRule" ADD CONSTRAINT "automationRule_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automationRule" ADD CONSTRAINT "automationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automationExecution" ADD CONSTRAINT "automationExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automationExecution" ADD CONSTRAINT "automationExecution_businessEventId_fkey" FOREIGN KEY ("businessEventId") REFERENCES "businessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentSafetyPolicy" ADD CONSTRAINT "agentSafetyPolicy_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "businessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agentSafetyPolicy" ADD CONSTRAINT "agentSafetyPolicy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
