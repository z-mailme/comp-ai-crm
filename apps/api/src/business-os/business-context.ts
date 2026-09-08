import {
	isWorkspaceAdmin,
	toWorkspaceRole,
	WORKSPACE_ID,
	type WorkspaceRole,
} from "@crm/auth";
import { BusinessUnitStatus, type Db } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@nestjs/common";

export type BusinessContextSource = {
	userId: string;
	businessUnitId?: string | null;
};

export type BusinessContext = {
	workspaceId: typeof WORKSPACE_ID;
	userId: string;
	businessUnitId: string;
	role: WorkspaceRole;
	includeUnscoped: boolean;
	permissions: {
		crossBusinessRead: false;
	};
};

export async function resolveDefaultBusinessUnitId(
	db: Db,
	userId: string,
): Promise<string | null> {
	const member = await db.member.findUnique({
		where: {
			organizationId_userId: {
				organizationId: WORKSPACE_ID,
				userId,
			},
		},
		select: { role: true },
	});

	if (!member) return null;

	const role = toWorkspaceRole(member.role);
	const activeUnits = await db.businessUnit.findMany({
		where: { status: BusinessUnitStatus.ACTIVE },
		select: { id: true, ownerId: true },
		orderBy: { name: "asc" },
	});

	const authorizedUnits = activeUnits.filter((unit) =>
		canUseBusinessUnit(role, userId, unit.ownerId),
	);

	return authorizedUnits.length === 1 ? (authorizedUnits[0]?.id ?? null) : null;
}

export async function resolveBusinessContext(
	db: Db,
	source: BusinessContextSource,
): Promise<BusinessContext> {
	const requested = source.businessUnitId?.trim() || null;
	const member = await db.member.findUnique({
		where: {
			organizationId_userId: {
				organizationId: WORKSPACE_ID,
				userId: source.userId,
			},
		},
		select: { role: true },
	});

	if (!member) {
		throw new ForbiddenException("You are not a member of this workspace.");
	}

	const role = toWorkspaceRole(member.role);
	const activeUnits = await db.businessUnit.findMany({
		where: { status: BusinessUnitStatus.ACTIVE },
		select: { id: true, ownerId: true },
		orderBy: { name: "asc" },
	});

	if (requested) {
		const unit = activeUnits.find((row) => row.id === requested);

		if (!unit) {
			throw new NotFoundException("Business unit not found.");
		}

		if (!canUseBusinessUnit(role, source.userId, unit.ownerId)) {
			throw new ForbiddenException("You cannot access this business unit.");
		}

		return {
			workspaceId: WORKSPACE_ID,
			userId: source.userId,
			businessUnitId: unit.id,
			role,
			includeUnscoped: false,
			permissions: { crossBusinessRead: false },
		};
	}

	if (activeUnits.length === 0) {
		throw new NotFoundException("No active business unit exists.");
	}

	const authorizedUnits = activeUnits.filter((unit) =>
		canUseBusinessUnit(role, source.userId, unit.ownerId),
	);

	if (authorizedUnits.length === 0) {
		throw new ForbiddenException("You cannot access a business unit.");
	}

	if (authorizedUnits.length > 1) {
		throw new BadRequestException("Choose a business unit.");
	}

	const businessUnit = authorizedUnits[0];

	if (!businessUnit) {
		throw new ForbiddenException("You cannot access a business unit.");
	}

	return {
		workspaceId: WORKSPACE_ID,
		userId: source.userId,
		businessUnitId: businessUnit.id,
		role,
		includeUnscoped: activeUnits.length === 1,
		permissions: { crossBusinessRead: false },
	};
}

function canUseBusinessUnit(
	role: WorkspaceRole,
	userId: string,
	ownerId: string | null,
): boolean {
	return isWorkspaceAdmin(role) || ownerId === userId;
}
