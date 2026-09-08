import {
	BadRequestException,
	createParamDecorator,
	type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import type { z } from "zod";

export function zodBody<Schema extends z.ZodType>(schema: Schema) {
	return createParamDecorator((_data, context: ExecutionContext) => {
		const request = context.switchToHttp().getRequest<Request>();
		const parsed = schema.safeParse(request.body);

		if (!parsed.success) {
			throw new BadRequestException(
				parsed.error.issues.map((issue) => issue.message).join(" "),
			);
		}

		return parsed.data;
	})();
}
