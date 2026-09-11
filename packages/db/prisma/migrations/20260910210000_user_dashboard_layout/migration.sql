CREATE TABLE "userDashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dashboard" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "userDashboardLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "userDashboardLayout_userId_dashboard_key" ON "userDashboardLayout"("userId", "dashboard");

ALTER TABLE "userDashboardLayout" ADD CONSTRAINT "userDashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
