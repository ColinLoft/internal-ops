# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Staff and employees of a single nonprofit organization, using Flown as their daily workspace. Their jobs span communication (chat, email, calendar), documents (drive/editor), and operations (programs, finance, legal, GTM, engineering, people/organization, customers, support).

## Product Purpose
Flown ("Nonprofit Employee Workspace") puts a nonprofit's everyday work in one place so staff do not juggle separate chat, email, docs, and ops tools. Success is a team that can find, do, and coordinate its work from a single organized, easy-to-use app.

## Positioning
One workspace, purpose-built for nonprofit operations: organized, easy to use, modern, and good-looking. Chat, email, calendar, drive, finance (HCB integration), programs, legal, and an AI assistant live together rather than as separate tools.

## Operating Context
Used all day by employees of one organization. Must work as a web app, as a desktop (computer) app, and on mobile. Backed by Supabase (auth, data, edge functions for email, AI, invites, LiveKit calls) and deployed on Vercel.

## Capabilities and Constraints
- Existing surfaces: home, chat (channels, DMs, threads, polls, calls), email inbox and rules, calendar, drive with editor (docs, slides, sheets, forms), customers, finance, programs, legal, GTM, engineering, insights, organization (policies, leave requests), help, admin, notifications, workspace AI assistant.
- Stack: React 18, Vite, Tailwind CSS, framer-motion, lucide-react, Supabase, LiveKit.
- Must be responsive across desktop, web, and mobile form factors. Native-app wrappers are not recorded as a separate platform; mobile web and desktop shells stay `web`.
- Undecided: whether desktop/mobile ship as wrappers (e.g. Electron/Capacitor) or only as responsive web.

## Brand Commitments
Name: Flown. An existing brand icon is at `public/brand-icon.png`. The current look uses Plus Jakarta Sans and Inter with a blue brand color; no binding visual direction beyond "modern and looks good" was stated.

## Evidence on Hand
Setup docs in `docs/` (Azure OpenAI, email inbox, email suite rollout). No testimonials, customer logos, or metrics were provided; do not fabricate them.

## Product Principles
- Everything in one place: prefer integrating a workflow into the workspace over sending users elsewhere.
- Organized by default: clear navigation and structure across a large surface area.
- Easy to use: staff of varying technical skill should be productive without training.
- Modern and polished: visual quality is part of the product's value.
- Consistent across devices: web, desktop, and mobile get the same capability.

## Accessibility & Inclusion
No product-specific standard was established. Undecided.
