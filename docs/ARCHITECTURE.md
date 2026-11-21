# The Virtual Bookshelf — Architecture & Engineering Decisions

## 1. System Overview

The Virtual Bookshelf is organized as an npm workspaces TypeScript monorepo (`packages/shared`, `backend`, `frontend`) designed around three strict boundaries:

1. **Domain & Calculation Layer (`packages/shared`)**: Pure, dependency-light TypeScript utilities for ISBN-10/ISBN-13 validation and normalization, physical dimension estimation/verification, spine visual synthesis, and shared Zod request schemas.
2. **Persistence & External Integration Layer (`backend`)**: Fastify 5 REST API backed by Prisma ORM and SQLite, handling secure `scrypt` authentication with HTTP-only revocable sessions, normalized external book catalog queries, SSRF-safe allowlisted cover proxying, and sanitized custom image uploads.
3. **Physical Visual Presentation Layer (`frontend`)**: React 19 + Tailwind CSS v4 + layered CSS 3D components (`<Bookshelf />`, `<ShelfCompartment />`, `<Book />`, `<ProceduralCover />`, `<BookRevealModal />`) decoupled from external API schemas and persistence internals.

---

## 2. Rendering Approach: CSS 3D Transforms vs. Three.js / React Three Fiber

We evaluated full WebGL/Three.js rendering against layered CSS 3D transforms with directional photographic surface textures:

- **Why CSS 3D + Directional Textures Won**:
  - **Typography fidelity**: Standing book spines rely heavily on crisp vertical serif/sans titles at narrow widths (`24px–66px`). Native DOM text renders with subpixel clarity at all DPRs without generating 100+ dynamic WebGL canvas textures.
  - **Physical wood realism without background-image shortcuts**: The cabinet is built from true responsive structural components (stepped crown cornice, fluted side pilasters, darkened tongue-and-groove interior back paneling, recessed shelf decks, thick bevelled shelf planks, vertical mullions, and bottom plinth) mapped with directional horizontal (`-h.jpg`) and vertical (`-v.jpg`) natural wood grain textures, multi-layered ambient occlusion shadows, and warm brass sconce lighting.
  - **Drag-and-drop, accessibility, and performance**: `@dnd-kit` sortable interactions, native keyboard focus, ARIA labeling, `prefers-reduced-motion` compliance, and 60 FPS GPU-composited animations scale effortlessly past 100+ books with zero WebGL context loss and a lightweight ~140 KB gzipped client bundle.
  - **3D Book Reveal**: Clicking a book animates a true 6-sided CSS `preserve-3d` volume (`front`, `spine`, `back`, `right page block`, `top page block`) turning outward from its spine orientation to reveal the real front cover and striated cream paper edges.

---

## 3. External Book Services Evaluation: Google Books vs. Open Library

### Capabilities & Observed Constraints
- **Google Books Volumes API** (Primary): Rich descriptions, occasional `volumeInfo.dimensions` (height/width/thickness in cm), and ISBN-10/ISBN-13 arrays. However, unauthenticated requests frequently hit shared-quota `HTTP 429 RESOURCE_EXHAUSTED` limits, and cover links often arrive as `http://` with curled corners (`edge=curl`).
- **Open Library Search & Covers API** (Fallback & Enrichment): Free, reliable with an explicit `User-Agent` header and targeted `fields` selection, exposes multiple ISBNs, publishers, `edition_key` lists, median page counts, and `cover_i` cover IDs. Rarely includes physical dimensions or long synopses directly in search results.

### Architectural Mitigations
1. **Circuit-Breaker Failover & Caching**: `BookSearchService` caches normalized search responses in memory (10-minute TTL, bounded LRU) and trips a 5-minute circuit breaker on Google Books `429`/`403`/`5xx` responses so queries route immediately to Open Library with a transparent notice. Supplying `GOOGLE_BOOKS_API_KEY` restores full Google Books quota automatically.
2. **Missing Spine Artwork**: Neither API supplies spine images. When a book has a front cover, the frontend samples representative colors via an offscreen `<canvas>` from our same-origin `/api/covers/proxy` endpoint (avoiding cross-origin canvas tainting) to generate a coherent spine palette. Users can also override spine colors, textures, motifs, typography, or upload custom cover/spine images.
3. **Physical Dimensions Integrity**: `resolvePhysicalDimensions()` sets `source: 'verified'` **only** when valid height, width, and thickness measurements are provided by publisher metadata. Otherwise, it estimates thickness from `pageCount` (configurable mm/page caliper + cover board thickness) and format defaults (`hardcover`, `trade-paperback`, `mass-market`, `quarto`, `pocket`), clamps visual dimensions to readable shelf bounds (`24px–66px` wide, `152px–264px` tall), and always labels estimates transparently as *Estimated Dimensions*.
4. **SSRF-Safe Cover Proxy**: `/api/covers/proxy` strictly allowlists `books.google.com`, `books.googleusercontent.com`, `lh3.googleusercontent.com`, and `covers.openlibrary.org` (plus Open Library's `archive.org` image CDN redirects), ignores Open Library's 43-byte 1×1 transparent placeholder GIFs, and serves long-lived `Cache-Control` headers.

---

## 4. Database Schema & API Summary

### SQLite / Prisma Models
- `User`: `id`, `username` (unique, normalized lowercase), `passwordHash` (`scrypt:<salt>:<hash>`), `createdAt`
- `Session`: `id`, `tokenHash` (SHA-256 of cookie token), `userId`, `expiresAt`, `createdAt`
- `Bookshelf`: `id`, `userId`, `name`, `visualTheme`, `configuration` (JSON)
- `ShelfCompartment`: `id`, `bookshelfId`, `row`, `column`, `ordering`, `widthRatio`, `heightPx`, `settings` (JSON)
- `Book`: `id`, `provider`, `providerBookId`, `isbn`, `title`, `authors` (JSON), `publisher`, `publicationDate`, `pageCount`, `physicalDimensions` (JSON), `coverUrl`, `metadata` (JSON)
- `ShelfBook`: `id`, `bookshelfId`, `compartmentId`, `bookId`, `position`, `visualOverrides` (JSON), `orientation`

Placement (`ShelfBook`) is completely separated from bibliographic metadata (`Book`), so layout restructures safely re-home books onto surviving compartments without data loss.

### Key REST Endpoints
- `POST /api/auth/register`, `POST /api/auth/login` (rate-limited), `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/bookshelf`, `PATCH /api/bookshelf`, `PUT /api/bookshelf/layout`, `POST /api/bookshelf/layout/reset`, `POST /api/bookshelf/seed-samples`
- `GET /api/books/search?q=&type=all|title|author|isbn&page=&limit=`
- `POST /api/bookshelf/books`, `PATCH /api/bookshelf/books/:shelfBookId`, `POST /api/bookshelf/books/reorder`, `DELETE /api/bookshelf/books/:shelfBookId`
- `POST /api/uploads/book-image`, `GET /api/covers/proxy?url=...`

---

## 5. Known Limitations & Future Opportunities

- **External Cover Latency**: Open Library Covers (`covers.openlibrary.org`) can occasionally take 1–3 seconds per uncached cover. Search previews request medium (`-M.jpg`) thumbnails and render a procedural book cover underneath while loading so the UI never flickers or breaks.
- **Local Single-Node Storage**: SQLite (`backend/prisma/dev.db`) and local disk uploads (`backend/uploads/`) are optimized for simple local deployment; multi-node production hosting would swap SQLite for PostgreSQL and local uploads for object storage.
- **Horizontal Book Stacks & Decorative Bookends**: The current MVP supports vertical standing, left/right leaning, and face-out display orientations; horizontal book stacks and decorative shelf objects remain clean future enhancements.
