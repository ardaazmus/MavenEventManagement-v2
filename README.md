# Maven Event Management v2

> **Enterprise Event & Congress Management Platform**  
> Architected to IAPCO (International Association of Professional Congress Organisers), ICCA, and RainFocus operational standards. Built with Next.js 16 (Turbopack), TypeScript, Prisma ORM, and Tailwind CSS.

---

## 🚀 Key Highlights & Architecture

Maven Event Management v2 delivers a full-suite monolithic modular platform designed for large-scale congresses, medical conferences, summits, and exhibitions.

### 1. Domain Event Bus & Outbox Pattern
- In-process typed event bus with error isolation per subscriber.
- Transactional Outbox pattern (`OutboxEvent`) for bulletproof asynchronous event publishing.
- Automatic 3x exponential backoff retry and Dead Letter Queue (DLQ) quarantine.

### 2. Domain Manifests & Blast Radius Analysis
- Explicit entity manifests defining upstream/downstream event relationships and dependent modules.
- Built-in `scripts/impact-analysis.ts` CLI tool to compute modification blast radius in milliseconds without re-scanning code.
- Strict architecture boundary enforcement via `.dependency-cruiser.cjs`.

### 3. Dynamic Custom Fields Engine (EAV)
- Event-specific custom fields (`CustomFieldDefinition` & `CustomFieldValue`).
- Supported field types: `TEXT`, `NUMBER`, `SELECT`, `CHECKBOX`, `DATE`, `FILE`, `URL`, `PHONE`.
- Conditional visibility rules, required validations, and batch field updates via `/api/custom-fields/batch`.

### 4. High-Speed Common Data Entry Tools
- **Inline Table Editing:** Direct inline editing (`InlineEditableCell`) with full keyboard navigation.
- **Quick Add Row:** Rapid one-click / Enter-key inline record creation without modal overhead.
- **Bulk Paste Import:** Copy-paste directly from Microsoft Excel or Google Sheets with fuzzy column auto-matching using Levenshtein distance (`fastest-levenshtein`).

### 5. Advanced CRM (People & Organizations)
- Multi-role person management (`DELEGATE`, `SPEAKER`, `AUTHOR`, `VIP`, `COMMITTEE`, `EXHIBITOR`).
- Organization hierarchy supporting Associations, Pharma Companies, Travel Agencies, and Universities.
- Agency group capacity tracking, delegate binding, and combined group invoices.

### 6. Agency Group Batch Registration Console
- Dedicated agency registration tab to input up to 50+ delegates in under a minute.
- Batch invoicing, single confirmation billing, and automated multi-axis status updates (`registrationStatus`, `paymentStatus`, `attendanceStatus`).

### 7. Financial Ledger & Double-Entry Accounting
- Real-time income and expense tracking, vendor bindings, receipt number audits.
- Multi-currency support (TRY, USD, EUR, GBP), VAT rate management, and bank transfer reconciliation.

### 8. Scientific Program & Conflict-Free Timetable
- Double-blind peer review scoring system with multi-criteria rubrics (Originality, Methodology, Relevance, Clarity).
- Z-score score normalization and Conflict of Interest (COI) detector.
- Interactive drag-and-drop timetable grid with room collision prevention and 15-minute turnover buffer.

### 9. Hotel Rooming List & Block Matrix
- Date-based hotel room block heatmaps and attrition tracking (contract clause safeguards).
- Sub-block segmentation (VIP, Staff, Exhibitors, Delegates) and roommate drag-and-drop pairing for twin/double rooms.

### 10. Sponsorship Kanban & Floor Plan Studio
- 4-stage pipeline Kanban (Lead → Proposal → Contract → Paid) and B2B table-time appointment matrix.
- Interactive SVG exhibition floor plan with 15-minute TTL reservation hold timers, utility requirement specifications (kW electricity, water, furniture), and direct sales confirmation.

### 11. Native PWA Mobile Experience
- Edge-to-edge standalone display (`viewport-fit=cover`, safe-area insets, dynamic island support).
- Service Worker caching (StaleWhileRevalidate + NetworkFirst) with IndexedDB offline mutation queue (`idb`).
- Integrated camera QR scanner (`jsQR`), iOS swipe-back gestures, spring physics bottom sheets (`vaul`), and Apple / Google Wallet pass generation.

### 12. Onsite Touchless Kiosk & Thermal Badge Printing
- Fullscreen touchless kiosk mode (<2s check-in latency) with camera QR scanning and hardware USB barcode reader input.
- Zebra ZPL II thermal label template generator and WebSocket bridge (`QZ Tray` / `Zebra Browser Print`).
- Anti-fraud badge reprint protection with supervisor PIN challenge and reprint counter tracking.
- Live venue occupancy gauge (net current attendees inside venue, entries, and exits).
- Session-level door scanning and automatic CME / CPD credit qualification tracking (%70 attendance threshold).

---

## 🛠️ Technology Stack

- **Framework:** Next.js 16.1.3 (App Router, Turbopack)
- **Language:** TypeScript 5.x
- **Runtime:** Bun 1.3+ / Node.js 20+
- **Database & ORM:** Prisma ORM 6.x (SQLite local dev; MySQL / MariaDB / PostgreSQL compatible)
- **Styling & UI:** Tailwind CSS, Shadcn UI, Radix UI primitives, Lucide Icons
- **Key Libraries:** `@tanstack/react-table`, `@dnd-kit`, `vaul`, `jsqr`, `idb`, `fastest-levenshtein`

---

## 💻 Getting Started Locally

### Prerequisites
- [Bun](https://bun.sh/) (v1.2+) or Node.js (v20+)
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ardaazmus/event-management-v2.git
   cd event-management-v2
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

4. **Initialize database:**
   ```bash
   bunx prisma db push
   bunx prisma generate
   ```

5. **Start local development server:**
   ```bash
   bun run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Verification & Build

- **Typecheck:**
  ```bash
  bunx tsc --noEmit
  ```
- **Production Build:**
  ```bash
  bunx next build
  ```
- **Impact Analysis (Blast Radius):**
  ```bash
  bun run scripts/impact-analysis.ts --changed src/lib/events/domain-event-bus.ts
  ```

---

## 📄 License
Private & Proprietary — Maven Event Management.
