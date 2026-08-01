# Book Keeper Pro

# ROLE

You are a senior full-stack engineer, database architect, and UI/UX designer.

Build the foundation of a production-ready bookstore inventory management system.

This phase should focus ONLY on project setup, authentication, database architecture, and the basic inventory dashboard.

Do NOT build checkout, analytics, or AI yet.

Everything should be scalable because future phases will extend this application.

---

# Tech Stack

Use:

• React

• TypeScript

• Tailwind CSS

• Shadcn UI

• Supabase

• PostgreSQL

• Supabase Authentication

• Supabase Realtime

• React Query

• React Hook Form

• Zod

---

# Authentication

Create a secure authentication system.

Pages:

• Login

• Register

• Forgot Password

• Reset Password

Only authenticated users can access the dashboard.

---

# User Roles

Create roles:

Owner

Manager

Cashier

Inventory Staff

Each role should be stored in the database.

Permissions will be used in later phases.

---

# Database Design

Create normalized database tables.

books

inventory

categories

publishers

suppliers

users

profiles

audit_logs

Each table should have:

UUID

created_at

updated_at

relationships

foreign keys

indexes

Enable Row Level Security.

---

# Inventory

Create a Books page.

Each book should contain:

Book Cover

Book Title

Author

ISBN

Category

Publisher

Supplier

Purchase Cost

Selling Price

Quantity

Shelf Location

Barcode

Minimum Stock Level

Status

Functions:

Add Book

Edit Book

Delete Book

Archive Book

Search

Filter

Pagination

Book Cover Upload

CSV Import placeholder

CSV Export placeholder

---

# Dashboard

Create a modern dashboard.

Cards:

Total Books

Different Titles

Inventory Value

Retail Value

Low Stock

Out of Stock

Recent Activity

Display placeholder charts for now.

No sales analytics yet.

---

# UI

Professional SaaS design.

Sidebar

Top navigation

Responsive

Dark Mode

Light Mode

Rounded cards

Beautiful tables

Modern typography

Loading skeletons

Empty states

Toast notifications

---

# Audit Logs

Every inventory action should create a log entry.

Book Added

Book Updated

Book Deleted

Book Archived

Include:

User

Timestamp

Action

---

# Deliverable

Generate a clean, production-ready application with authentication, inventory management, dashboard, and database architecture ready for future phases.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7bed5e57-ea4c-4743-87b5-33fb14a1b736).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
