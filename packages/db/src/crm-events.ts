export type CrmEventRecordKind = "company" | "contact" | "deal";

type CrmEventDefinition = {
	label: string;
	description: string;
	recordKind: CrmEventRecordKind;
};

export const CRM_EVENT_CATALOG = {
	"company.created": {
		label: "Company created",
		description: "A company is added to the CRM",
		recordKind: "company",
	},
	"contact.created": {
		label: "Contact created",
		description: "A contact is added to the CRM",
		recordKind: "contact",
	},
	"deal.created": {
		label: "Deal created",
		description: "A deal is added to the CRM",
		recordKind: "deal",
	},
	"deal.stage.changed": {
		label: "Deal stage changed",
		description: "A deal moves from one pipeline stage to another",
		recordKind: "deal",
	},
	"deal.opened": {
		label: "Deal opened",
		description: "A closed deal returns to the open pipeline",
		recordKind: "deal",
	},
	"deal.closed": {
		label: "Deal closed",
		description: "An open deal moves to a closed stage",
		recordKind: "deal",
	},
	"communication.received": {
		label: "Message received",
		description: "An email or WhatsApp message arrives from a contact",
		recordKind: "contact",
	},
	"communication.sent": {
		label: "Message sent",
		description: "An email or WhatsApp message goes to a contact",
		recordKind: "contact",
	},
	"pop.received": {
		label: "Proof of payment received",
		description: "A customer sends proof of payment",
		recordKind: "contact",
	},
} as const satisfies Record<string, CrmEventDefinition>;

export type CrmEventType = keyof typeof CRM_EVENT_CATALOG;

export const CRM_EVENT_TYPES = Object.keys(CRM_EVENT_CATALOG) as [
	CrmEventType,
	...CrmEventType[],
];
