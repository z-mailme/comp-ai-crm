# System Health OS

Date: 2026-09-06.

Status: architecture only.

## Purpose

System Health OS aggregates health, safety, cost, and audit data for the owner.

It does not replace monitoring engines.

## Areas

- Integrations
- Automations
- Infrastructure
- Backups
- Security
- AI Agents
- API Usage
- Audit Logs
- Incidents

## Integration Statuses

- HEALTHY
- DEGRADED
- DISCONNECTED
- RATE_LIMITED
- FAILED
- AUTH_REQUIRED

## Integrations To Track

- Gmail
- Google Calendar
- Listmonk
- Canva
- Google Ads
- Meta Ads
- InvoiceShelf
- ERPNext
- WhatsApp
- Telegram
- n8n
- storage
- payment providers

## Infrastructure Sources

Aggregate from existing tools where possible:

- Coolify
- Beszel
- Uptime Kuma
- PostgreSQL
- Redis
- Docker
- VPS hosts
- backup jobs
- storage providers

## AI Cost

Track where possible:

- model spend
- tokens
- agent runs
- research spend
- image API usage
- design API usage
- messaging spend
- ads API rate limits

## Kill Switches

Preserve or add switches for:

- AI autonomous actions
- outbound replies
- marketing sends
- Google Ads writes
- Meta Ads writes
- financial writes
- automations
- memory writes

Every switch change creates an audit event.

## BusinessEvents

- `system.integration.failed`
- `system.integration.recovered`
- `system.automation.failed`
- `system.backup.failed`
- `system.security.alert`
- `system.kill_switch.changed`

## Safety

Security events and kill switch changes require immutable audit history.
