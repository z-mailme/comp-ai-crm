# Document OS

Date: 2026-09-06.

Status: architecture only.

## Purpose

Document OS indexes contextual documents. It is not a generic file manager.

## Document Types

- quote
- invoice
- receipt
- proof of payment
- service agreement
- employment document
- NDA
- supplier contract
- booking agreement
- customer attachment
- asset document
- insurance document
- license
- certificate

## Links

Documents can link to:

- BusinessUnit
- Contact
- Company
- Deal
- Booking
- Invoice
- Payment
- Supplier
- Employee
- Asset
- Conversation
- Campaign

## Metadata

Store:

- source
- uploader
- provider id
- storage key
- filename
- mime type
- checksum
- version
- classification
- retention status
- permission scope

## AI Intelligence

The agent layer can propose:

- OCR text
- classification
- parties
- dates
- amounts
- invoice number
- contract expiry
- obligations
- likely linked record

Financial extraction is evidence, not accounting truth.

## BusinessEvents

- `document.created`
- `document.linked`
- `document.classified`
- `document.contract.expiring`
- `document.signed`
- `document.archived`

## Safety

Deletion, retention changes, and sensitive HR documents require approval and audit.
