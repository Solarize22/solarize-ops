# Solarize Home Energy — Operations App

A full Next.js operations dashboard for managing solar installs, permits, invoices, service tickets, and scheduling.

## Stack

- **Next.js 14** (App Router)
- **React 18**
- **Tailwind CSS**
- **Lucide React** (icons)
- **DM Sans + DM Mono** (Google Fonts)

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project structure

```
solarize-ops/
├── app/
│   ├── layout.jsx          # Root layout
│   ├── globals.css         # Design system + global styles
│   ├── page.jsx            # Dashboard (/)
│   ├── jobs/page.jsx       # Jobs pipeline (/jobs)
│   ├── permits/page.jsx    # Permit tracker (/permits)
│   ├── invoices/page.jsx   # Invoice tracker (/invoices)
│   ├── service/page.jsx    # Service board (/service)
│   ├── scheduling/page.jsx # Scheduling calendar (/scheduling)
│   └── reports/page.jsx    # Reports + metrics (/reports)
├── components/
│   └── AppShell.jsx        # Sidebar + layout wrapper
└── lib/
    ├── data.js             # All sample data (jobs, permits, invoices, service, schedule)
    └── utils.js            # Badge colors, formatters
```

---

## Pages

| Route         | Description                                           |
|---------------|-------------------------------------------------------|
| `/`           | Dashboard — alerts, stat cards, job pipeline table    |
| `/jobs`       | Full job cards with search, filter, progress bars     |
| `/permits`    | Permit tracker table with AHJ, dates, status          |
| `/invoices`   | M1/M2 invoice table, overdue alerts, aging summary    |
| `/service`    | Service ticket cards with urgency and notes           |
| `/scheduling` | Timeline view grouped by date                         |
| `/reports`    | Ops health, pipeline breakdown, revenue by rep        |

---

## Connecting real data

All data currently lives in `lib/data.js`. To connect to a real backend:

1. **Airtable** — Use the Airtable API with `fetch()` in server components
2. **Google Sheets** — Use the Sheets API or a library like `google-spreadsheet`
3. **Supabase** — Drop in the Supabase JS client and replace the static arrays

The data shape in `lib/data.js` serves as your schema reference.

---

## Next build steps

- [ ] Real database (Supabase or Airtable)
- [ ] Login / authentication (NextAuth)
- [ ] Role permissions (owner vs. office vs. rep)
- [ ] Job detail pages (`/jobs/[id]`)
- [ ] Add/edit job forms
- [ ] Email notifications for overdue invoices and blockers
- [ ] Document storage per job (SiteCapture or S3)
