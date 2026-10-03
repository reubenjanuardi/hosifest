# HOSIFEST System Design Documentation

## Status

**Architecture Baseline v4 — Finalized Business Configuration + Dockerized VPS + CI/CD + Dynamic Ticket & Souvenir Configuration**

Dokumen ini adalah baseline handoff teknis untuk membangun **HOSIFEST Event Commerce & Ticketing System**.

v4 memasukkan keputusan bisnis terbaru:
- 3 sales phase: Early Bird, Presale, Normal
- Total planned ticket allocation 200
- Early Bird 95 tickets
- Early Bird Hosiana 35 tickets dengan discount code, harga efektif Rp150.000
- Early Bird Mupel Jakarta Pusat 60 tickets, harga Rp175.000
- Presale 55 tickets, harga Rp225.000
- Presale includes beverage selection + tumbler
- Normal 50 tickets, harga Rp250.000
- Kuota harus configurable, bukan hardcoded
- Beverage catalog dinamis
- Souvenir charm/accessory catalog dinamis
- Satu ticket = satu custom canvas keychain
- Customization wajib per ticket
- QR dipakai untuk ENTRY dan EXIT
- Re-entry diperbolehkan; setiap masuk/keluar wajib scan
- Payment menggunakan QRIS/bank transfer dengan bukti pembayaran manual
- Payment proof deadline 30 menit
- Payment ditolak langsung membuat order CANCELLED
- Ticket quota dan discount reservation dikembalikan ketika order expired/cancelled
- Full application deployment menggunakan Docker images
- GitHub Actions melakukan CI/CD
- Image production dipublish ke GHCR
- VPS menarik image immutable
- Public access melalui Cloudflare Tunnel yang sudah ada
- Existing external Docker network: `hosiana_network`

## Source of Business Requirements

Draft proposal HOSIFEST menjadi sumber kebutuhan awal. Proposal menggambarkan HOSIFEST sebagai festival anak muda dengan movie screening, games, entertainment, food & beverage, doorprize dan aktivitas interaktif. Proposal juga menetapkan target penerimaan Rp20.000.000 dan target penjualan 200 tiket, serta mencantumkan keychain canvas custom, kopi, milktea, tumbler dan snack.

Nilai dari dokumen ini adalah keputusan sistem terbaru dan menjadi override terhadap placeholder proposal yang sudah diganti secara eksplisit oleh panitia.

## Source of Truth Priority

1. `12-business-rules.md`
2. `13-domain-model.md`
3. `01-functional-and-nonfunctional-requirements.md`
4. `03-business-process.md`
5. `04-data-model-erd.md`
6. `05-api-specification.md`
7. `06-frontend-information-architecture.md`
8. `07-deployment-architecture.md`
9. `09-ci-cd-and-docker.md`
10. `10-custom-souvenir-design.md`
11. `11-security-and-operations.md`
12. `08-development-roadmap.md`

## Document Map

| File | Purpose |
|---|---|
| `00-system-scope.md` | Scope and overall architecture |
| `01-functional-and-nonfunctional-requirements.md` | Functional and non-functional requirements |
| `02-actors-roles-use-cases.md` | Actors, roles and use cases |
| `03-business-process.md` | Business process and state transitions |
| `04-data-model-erd.md` | Logical data model and ERD baseline |
| `05-api-specification.md` | REST API contract |
| `06-frontend-information-architecture.md` | Public, checkout, admin and attendance UX |
| `07-deployment-architecture.md` | Docker/VPS/Cloudflare architecture |
| `08-development-roadmap.md` | Development phases |
| `09-ci-cd-and-docker.md` | GitHub Actions and image deployment |
| `10-custom-souvenir-design.md` | Dynamic souvenir customization |
| `11-security-and-operations.md` | Security, backup and event-day operations |
| `12-business-rules.md` | Final business rules |
| `13-domain-model.md` | Domain model derived from final rules |

## Critical Rule

**Do not hardcode business configuration that is explicitly marked configurable.**

This includes:
- ticket quota
- sales phase dates
- ticket prices
- beverage choices
- souvenir options
- Mupel congregation list
- purchase limits
- discount usage limits

Business data should be seeded/configured through database/admin interfaces, not embedded in frontend or backend source code.
