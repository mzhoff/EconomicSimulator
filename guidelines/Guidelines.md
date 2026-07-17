---
name: feature-sliced-design
description: Apply Feature-Sliced Design (FSD) v2.1 architectural methodology to frontend projects. Use when organizing code structure, decomposing features, creating new components or features, refactoring existing codebases, or when users mention "FSD", "Feature-Sliced", layers, slices, or frontend architecture patterns.
---

# Feature-Sliced Design (FSD) Skill - v2.1.0

An architectural methodology skill for scaffolding and organizing frontend applications using Feature-Sliced Design principles.

## Overview

Feature-Sliced Design v2.1 is a compilation of rules and conventions for organizing frontend code to make projects more understandable, maintainable, and stable in the face of changing business requirements.

**Version 2.1 introduces the "Pages First" approach** - keeping more code in pages and widgets rather than prematurely extracting it to features and entities.

## Core Principles

### The "Pages First" Approach (FSD v2.1)

**The fundamental principle of FSD v2.1: Keep code where it's used until you need to reuse it.**

Instead of immediately extracting everything into entities and features, start by keeping code in pages and widgets. Only move code to lower layers when you actually need to reuse it.

#### What stays in Pages and Widgets:

✅ **Large UI blocks** that are only used on one page
✅ **Forms and their validation logic** specific to a page
✅ **Data fetching and state management** for page-specific data
✅ **Business logic** that serves only this page/widget
✅ **API interactions** needed only here

#### When to extract to lower layers:

- **To Shared**: When you need the same *infrastructure* in multiple places (modal manager, date formatter, UI components)
- **To Entities**: When you have a clear *business domain model* that's used across multiple features
- **To Features**: When you have a complete *user interaction* that's reused in multiple places

#### Why "Pages First"?

1. **Better code cohesion** - related code stays together
2. **Easier to delete** - unused code is right there with its usage
3. **Less abstraction overhead** - no need to identify entities/features prematurely
4. **Natural decomposition** - pages are intuitive to understand
5. **Faster development** - no time wasted on premature optimization

### 1. Layered Architecture (Vertical Organization)

FSD uses **6 active standardized layers** organized by responsibility and dependencies. Layers are ordered from most specific (top) to most generic (bottom):

app/ ← Application initialization, providers, global styles
pages/ ← Full page compositions with their own logic, routing
widgets/ ← Large composite UI blocks with their own logic
features/ ← Reusable user interactions and business features
entities/ ← Reusable business entities (user, product, order)
shared/ ← Reusable infrastructure code (UI kit, utils, API)


**Note**: Historically, FSD included `processes/` as a 7th layer, but it is **deprecated** in v2.1. If you're using it, move the code to `features/` with help from `app/` if needed.

**Import Rule**: A module can only import from layers **strictly below** it.
- ✅ `features/` → `entities/`, `shared/`
- ✅ `pages/` → `widgets/`, `features/`, `entities/`, `shared/`
- ❌ `entities/` → `features/` (upward import)
- ❌ `features/comments/` → `features/posts/` (same-layer cross-import)

### 2. Slices (Horizontal Organization)

Slices group code by **business domain meaning**. Each slice represents a specific business concept:

features/
├── auth/ ← Authentication feature
├── comments/ ← Comments functionality
└── post-editor/ ← Post editing feature

entities/
├── user/ ← User business entity
├── product/ ← Product business entity
└── order/ ← Order business entity


**Key Rules**:
- Slices must be **independent** from other slices on the same layer (zero coupling)
- Slices should contain **most code related to their primary goal** (high cohesion)
- Slice names are **not standardized** - they reflect your business domain

### 3. Segments (Technical Organization)

Segments group code within slices by **technical purpose**:

features/
└── auth/
├── ui/ ← React components, styles, formatters
├── api/ ← API requests, data types, mappers
├── model/ ← State management, business logic, stores
├── lib/ ← Internal utilities for this slice
├── config/ ← Configuration, feature flags
└── index.ts ← Public API (exports only what other slices need)


**Standard Segments**:
- `ui` - UI components, styles, date formatters
- `api` - Backend interactions, request functions, data types
- `model` - Data models, state stores, business logic
- `lib` - Utility functions needed by this slice
- `config` - Configuration files, feature flags

### 4. Public API

Every slice must define a **public API** through an index file:

```typescript
// features/auth/index.ts
export { LoginForm } from './ui/LoginForm';
export { useAuth } from './model/useAuth';
export { loginUser } from './api/loginUser';
// Internal files not exported remain private to the slice
Rule: Modules outside a slice can only import from the public API, not from internal files.

Public API for Cross-Imports (@x notation)
New in v2.1: You can now create explicit connections between slices on the same layer (typically entities) using the @x notation.

This allows entities to reference each other when there's a legitimate business relationship:

// entities/user/index.ts
export { UserCard } from './ui/UserCard';
export { userModel } from './model';

// entities/user/@x/order.ts
// Cross-import API specifically for the order entity
export { UserOrderHistory } from './ui/UserOrderHistory';
export { getUserOrders } from './api/getUserOrders';

// entities/order/index.ts
import { UserOrderHistory } from '@/entities/user/@x/order';
// Now order can import from user's cross-import API
When to use cross-imports:

There's a clear business relationship between entities (e.g., User and Order)
The dependency is bidirectional or circular in the business domain
You want to keep the code together while acknowledging the relationship
Important: Regular cross-imports between slices (without @x) are still not allowed. Use @x notation to make cross-dependencies explicit and controlled.

Layer Definitions & Examples
App Layer
Application-wide settings, providers, routing setup.

app/
  ├── providers/      ← Redux Provider, React Query, Theme Provider
  ├── styles/         ← Global CSS, resets, theme variables
  ├── index.tsx       ← Application entry point
  └── router.tsx      ← Route configuration
Pages Layer
Route-level compositions with their own logic and data management.

pages/
  ├── home/
  │   ├── ui/
  │   │   ├── HomePage.tsx
  │   │   ├── HeroSection.tsx      ← Large UI blocks
  │   │   └── FeaturesGrid.tsx
  │   ├── model/
  │   │   └── useHomeData.ts       ← Page-specific state
  │   ├── api/
  │   │   └── fetchHomeData.ts     ← Page-specific API
  │   └── index.ts
  ├── profile/
  │   ├── ui/
  │   │   ├── ProfilePage.tsx
  │   │   ├── ProfileForm.tsx      ← Forms specific to this page
  │   │   └── ProfileStats.tsx
  │   ├── model/
  │   │   ├── profileStore.ts      ← State for profile page
  │   │   └── validation.ts        ← Form validation
  │   ├── api/
  │   │   ├── updateProfile.ts
  │   │   └── fetchProfile.ts
  │   └── index.ts
  └── settings/
v2.1 Approach: Pages can now contain:

✅ Large UI blocks used only on this page
✅ Forms and their validation logic
✅ Data fetching and state management
✅ Business logic that serves only this page
✅ API interactions specific to this page
Only extract to lower layers when you need to reuse the code elsewhere.

Widgets Layer
Complex, composite UI blocks with their own logic, used across multiple pages.

widgets/
  ├── header/
  │   ├── ui/
  │   │   ├── Header.tsx
  │   │   ├── Navigation.tsx
  │   │   └── UserMenu.tsx
  │   ├── model/
  │   │   └── headerStore.ts       ← Widget state
  │   ├── api/
  │   │   └── fetchNotifications.ts ← Widget-specific API
  │   └── index.ts
  ├── sidebar/
  │   ├── ui/
  │   ├── model/
  │   │   └── sidebarState.ts
  │   └── index.ts
  └── footer/
v2.1 Approach: Widgets are no longer just compositional blocks. They can contain:

✅ UI components of the widget
✅ Widget-specific state management
✅ Business logic that serves the widget
✅ API interactions the widget needs
✅ Internal utilities
Only extract code to entities/features when other widgets or pages need it.

Features Layer
Reusable user interactions and complete business features used in multiple places.

features/
  ├── auth/
  │   ├── ui/
  │   │   ├── LoginForm.tsx
  │   │   └── RegisterForm.tsx
  │   ├── model/
  │   │   └── useAuth.ts
  │   ├── api/
  │   │   ├── login.ts
  │   │   └── register.ts
  │   └── index.ts
  ├── add-to-cart/
  ├── like-post/
  └── comment-create/
v2.1 Approach: Only create a feature when:

✅ The user interaction is used on multiple pages/widgets
✅ It's a complete, self-contained user action
✅ It has clear business value
Don't create features prematurely. If a user interaction is only used in one place, keep it in the page or widget until you actually need to reuse it.

Entities Layer
Reusable business entities - the core domain models used across the application.

entities/
  ├── user/
  │   ├── ui/
  │   │   ├── UserCard.tsx
  │   │   └── UserAvatar.tsx
  │   ├── model/
  │   │   ├── types.ts
  │   │   └── userStore.ts
  │   ├── api/
  │   │   └── userApi.ts
  │   ├── @x/
  │   │   └── order.ts             ← Cross-import API for order
  │   └── index.ts
  ├── product/
  └── order/
v2.1 Approach: Only create an entity when:

✅ It represents a clear business domain concept
✅ It's used in multiple features, pages, or widgets
✅ It has well-defined boundaries and responsibilities
Don't prematurely extract entities. If a data structure is only used in one place, keep it there until you need to share it.

Shared Layer
Reusable infrastructure code with no business logic.

shared/
  ├── ui/             ← UI kit components
  │   ├── Button/
  │   ├── Input/
  │   └── Modal/
  ├── lib/            ← Utilities
  │   ├── formatDate/
  │   ├── debounce/
  │   └── classnames/
  ├── api/            ← API client setup, base config
  │   ├── client.ts
  │   └── apiRoutes.ts        ← Route constants (v2.1: allowed!)
  ├── config/         ← Environment variables, constants
  │   ├── env.ts
  │   └── appConfig.ts
  ├── assets/         ← Images, fonts, icons
  │   ├── logo.svg            ← Company logo (v2.1: allowed!)
  │   └── icons/
  └── types/          ← Common TypeScript types
v2.1 Update: Shared can now contain application-aware code:

✅ Route constants and path builders
✅ API endpoint definitions
✅ Company branding assets (logos, colors)
✅ Application configuration
✅ Common type definitions
Still not allowed:

❌ Business logic (calculations, workflows, domain rules)
❌ Feature-specific code
❌ Entity-specific code
No slices in Shared - organized by segments only. Segments can import from each other within Shared.

Common Patterns
1. Working with API (Pages First Approach)
Start simple - keep API logic in the page until you need to reuse it:

// pages/profile/api/fetchProfile.ts
export const fetchProfile = (id: string) => 
  apiClient.get(`/users/${id}`);

// pages/profile/model/useProfile.ts
export const useProfile = (id: string) => {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    fetchProfile(id).then(setUser);
  }, [id]);
  
  return user;
};

// pages/profile/ui/ProfilePage.tsx
import { useProfile } from '../model/useProfile';

const ProfilePage = () => {
  const user = useProfile('123');
  return <div>{user?.name}</div>;
};
Only move to entities when other pages need the same API:

// entities/user/api/userApi.ts
export const fetchUser = (id: string) => 
  apiClient.get(`/users/${id}`);

// entities/user/model/userStore.ts
export const useUser = (id: string) => {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    fetchUser(id).then(setUser);
  }, [id]);
  
  return user;
};

// entities/user/index.ts
export { useUser } from './model/userStore';
export type { User } from './model/types';

// Now multiple pages can use it:
// pages/profile/ui/ProfilePage.tsx
// pages/user-list/ui/UserListPage.tsx
import { useUser } from '@/entities/user';
2. Feature Composition
Features can use entities and other features:

// features/post-card/ui/PostCard.tsx
import { UserAvatar } from '@/entities/user';
import { LikeButton } from '@/features/like-post';
import { CommentButton } from '@/features/comment-create';

export const PostCard = ({ post }) => (
  <article>
    <UserAvatar userId={post.authorId} />
    <h2>{post.title}</h2>
    <p>{post.content}</p>
    <div>
      <LikeButton postId={post.id} />
      <CommentButton postId={post.id} />
    </div>
  </article>
);
3. Handling Routes
Routes should be defined in the App layer, pages composed in Pages layer:

// app/router.tsx
import { HomePage } from '@/pages/home';
import { ProfilePage } from '@/pages/profile';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/profile/:id', element: <ProfilePage /> },
]);

// app/index.tsx
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

export const App = () => <RouterProvider router={router} />;
4. Shared UI Components
// shared/ui/Button/Button.tsx
export const Button = ({ children, onClick, variant = 'primary' }) => (
  <button className={`btn btn-${variant}`} onClick={onClick}>
    {children}
  </button>
);

// shared/ui/Button/index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Usage in feature
import { Button } from '@/shared/ui/Button';

const LoginForm = () => (
  <form>
    <Button variant="primary">Login</Button>
  </form>
);
Path Aliases
Use path aliases for clean imports:

// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/app/*": ["src/app/*"],
      "@/pages/*": ["src/pages/*"],
      "@/widgets/*": ["src/widgets/*"],
      "@/features/*": ["src/features/*"],
      "@/entities/*": ["src/entities/*"],
      "@/shared/*": ["src/shared/*"]
    }
  }
}
Decision Framework (v2.1 "Pages First")
When creating new code, follow this decision tree:
Start with: "Where is this code used?"

Used in only one page? → Keep it in that page/
Used in one widget across multiple pages? → Keep it in that widget/
Used across multiple pages/widgets? → Continue to question 2
Is it reusable infrastructure?

UI component with no business logic? → shared/ui/
Utility function (date formatting, etc.)? → shared/lib/
API client setup, route constants? → shared/api/ or shared/config/
If yes to any → shared/
If no → Continue to question 3
Is it a complete user action?

User interaction (login, add to cart, like post)? → features/
But only if it's reused in multiple places!
Is it a business domain concept?

Core business entity (user, product, order)? → entities/
But only if it's reused in multiple places!
Is it app-wide setup?

Global provider, router, theme? → app/
Quick Decision Examples:
"User profile form with validation"

Used only on profile page? → pages/profile/ui/ProfileForm.tsx
Used on profile + settings pages? → Consider features/profile-form/
Still not sure? → Start in page, extract when you actually need it elsewhere
"Product card component"

Shows on product list page only? → pages/products/ui/ProductCard.tsx
Shows on multiple pages? → widgets/product-card/ or entities/product/ui/ProductCard.tsx
Generic card layout? → shared/ui/Card/
"Fetch product data"

Only product detail page needs it? → pages/product-detail/api/fetchProduct.ts
Multiple pages need it? → entities/product/api/productApi.ts
"Modal manager"

Infrastructure for showing modals? → shared/ui/modal-manager/
Content of specific modals? → Keep in pages that use them
The Golden Rule:
"When in doubt, keep it in pages/widgets. Extract to lower layers when you actually need to reuse it."

Don't try to predict reusability. Wait for actual reuse to emerge, then refactor.

Anti-Patterns to Avoid
❌ Premature extraction (v2.1 key anti-pattern)

// Immediately creating an entity/feature before knowing if it's needed
// entities/user-profile-form/  ← Used only on one page!
✅ Solution: Keep in page until actually needed elsewhere

// pages/profile/ui/ProfileForm.tsx  ← Start here
// Only move to features/ when another page needs it
❌ Cross-imports between slices on same layer

// features/comments/ui/CommentList.tsx
import { likePost } from '@/features/like-post'; // BAD!
✅ Solution: Use @x notation for entities, or compose at higher layer

// For entities with business relationships:
// entities/user/@x/order.ts
export { UserOrderHistory } from './ui/UserOrderHistory';

// For features, compose at page level:
// pages/post/ui/PostPage.tsx
import { CommentList } from '@/features/comments';
import { LikeButton } from '@/features/like-post';
❌ Business logic in Shared

// shared/lib/userHelpers.ts
export const calculateUserReputation = (user) => { ... }; // BAD!
✅ Solution: Move to entities layer

// entities/user/lib/calculateReputation.ts
export const calculateUserReputation = (user) => { ... };
❌ Bypassing public API

import { LoginButton } from '@/features/auth/ui/LoginButton'; // BAD!
✅ Use public API

import { LoginButton } from '@/features/auth'; // GOOD!
❌ God slices (too much responsibility)

// features/user-management/  ← TOO BROAD
//   - login, register, profile-edit, password-reset, etc.
✅ Split into focused features

// features/auth/
// features/profile-edit/
// features/password-reset/
Migration from FSD v2.0 to v2.1
If you have an existing FSD 2.0 project, migration to 2.1 is non-breaking. You can adopt the "pages first" approach gradually.

Migration Steps:
Audit current features and entities

Which features/entities are used in only one place?
Mark them for potential moving to pages/widgets
Move page-specific code back to pages

Forms used on one page → pages/[page]/ui/
Page-specific API calls → pages/[page]/api/
Page-specific state → pages/[page]/model/
Move widget-specific code to widgets

Logic only used in one widget → keep in that widget
Don't extract to features prematurely
Keep truly reusable code in features/entities

Used in 2+ places → stays in features/entities
Clear business value → stays in features/entities
Update Shared with application-aware code

Move route constants → shared/api/routes.ts
Move company assets → shared/assets/
Keep it free of business logic
Deprecate Processes layer

Move code to features/ with help from app/ if needed
Consider using @x notation

For entities with bidirectional relationships
Makes cross-dependencies explicit
Example Migration:
Before (v2.0):

features/
  └── user-profile-form/    ← Only used on profile page
      ├── ui/
      ├── model/
      └── api/

pages/
  └── profile/
      └── ui/
          └── ProfilePage.tsx  ← Just composition
After (v2.1):

pages/
  └── profile/
      ├── ui/
      │   ├── ProfilePage.tsx
      │   └── ProfileForm.tsx  ← Moved here
      ├── model/
      │   └── profileStore.ts  ← Moved here
      └── api/
          └── updateProfile.ts ← Moved here
Migration Strategy
When migrating existing code to FSD:

Start with Shared: Move UI kit, utils, API client to shared/
Identify Entities: Extract business domain models to entities/
Extract Features: Isolate user interactions to features/
Create Pages: Compose pages from widgets and features
Setup App: Move global providers and routing to app/
Do it gradually - you don't need to refactor everything at once.

Working with Different Technologies
React + Redux
features/
  └── todo-list/
      ├── ui/
      │   └── TodoList.tsx
      ├── model/
      │   ├── todoSlice.ts       ← Redux slice
      │   ├── selectors.ts       ← Selectors
      │   └── thunks.ts          ← Async actions
      └── index.ts
React + React Query
entities/
  └── user/
      ├── ui/
      ├── api/
      │   └── userQueries.ts     ← React Query hooks
      ├── model/
      │   └── types.ts
      └── index.ts
Next.js
Place FSD structure in src/ folder to avoid conflicts with Next.js app/ or pages/ folders:

my-nextjs-project/
  ├── app/              ← Next.js App Router (if using)
  ├── pages/            ← Next.js Pages Router (if using)
  └── src/
      ├── app/          ← FSD app layer
      ├── pages/        ← FSD pages layer
      ├── widgets/
      ├── features/
      ├── entities/
      └── shared/
Framework Integration Examples
Vite + React + TypeScript
project/
  ├── src/
  │   ├── app/
  │   ├── pages/
  │   ├── widgets/
  │   ├── features/
  │   ├── entities/
  │   └── shared/
  ├── tsconfig.json
  ├── vite.config.ts
  └── package.json
Create React App
project/
  └── src/
      ├── app/
      ├── pages/
      ├── widgets/
      ├── features/
      ├── entities/
      └── shared/
Key Reminders (v2.1)
Pages First: Start by keeping code in pages/widgets, extract only when you need to reuse
Wait for actual reuse: Don't predict reusability, let it emerge naturally
Think in layers: Determine responsibility level before creating files
Slices are independent: No imports between slices on the same layer (except @x for entities)
High cohesion: Keep related code together in slices
Public API is mandatory: Always define what's exported via index.ts
Business logic can live in pages/widgets: Don't extract prematurely
Shared is for infrastructure: Now can include app-aware code (routes, assets) but no business logic
Processes layer deprecated: Move code to features/ with app/ layer help
Use @x for entity relationships: Make cross-dependencies explicit and controlled
Segments can import each other: In App and Shared layers
Follow the import rule: Only import from layers below
Quick Reference
Layer Selection:

Global setup → app/
Routes → pages/
Reusable composites → widgets/
User actions → features/
Business models → entities/
Infrastructure → shared/
Import Direction: App → Pages → Widgets → Features → Entities → Shared

Public API: Always create index.ts for slices to export public interface

Additional Resources
For more detailed information and edge cases:

Cross-imports: When slices need to communicate
Desegmentation: Why grouping by tech role is anti-pattern
Routing: Advanced routing patterns
SSR: Server-side rendering implementation
Monorepos: Multi-package FSD setup
Implementation Checklist
When implementing FSD in a project:


Setup path aliases in tsconfig.json

Create layer folders: app/, pages/, widgets/, features/, entities/, shared/

Move UI kit to shared/ui/

Move utilities to shared/lib/

Start with pages/ - keep code there first

Extract to features/entities only when you see actual reuse

Setup providers and routing in app/

Add public API (index.ts) to each slice

Configure Steiger linter for FSD rules (recommended)

Document architecture decisions for team
Steiger - Architectural Linter for FSD
Steiger is an official linter that helps enforce FSD rules automatically:

✅ Detects import rule violations
✅ Checks public API usage
✅ Identifies cross-imports between slices
✅ Ensures proper layer structure
✅ Provides actionable error messages
Installation:

npm install -D @feature-sliced/steiger
Usage:

npx steiger src
Steiger is production-ready and actively maintained. It's the best way to ensure your team follows FSD conventions consistently.

When to Use This Skill
Trigger this skill when:

User mentions "FSD", "Feature-Sliced Design", "feature sliced"
Creating new frontend project structure
Refactoring existing frontend codebase
Discussing code organization or architecture
Questions about where to put specific code
Issues with cross-imports or dependencies
Need to decompose features or components
Setting up project structure for React/Vue/Angular/Svelte
Migrating from FSD v2.0 to v2.1
Core Philosophy of FSD v2.1
"Start simple, extract when needed."

Don't try to predict the future architecture. Build features in pages and widgets first. When you see actual reuse patterns emerging, then extract to features and entities. This leads to:

✅ Better code cohesion (related code stays together)
✅ Easier refactoring (everything is in one place)
✅ Faster development (no premature abstractions)
✅ Clearer architecture (only necessary abstractions exist)
✅ Less cognitive overhead (simpler mental model)
This skill provides the foundational knowledge to structure any frontend application using Feature-Sliced Design v2.1 methodology. Always prioritize code cohesion, wait for actual reuse before extracting, and maintain proper layering to ensure maintainable and scalable code architecture.

<Button
        width="md"
        className={styles.cta}
        onClick={() => setIsRequestOpen(true)}
      >
        Оставить заявку
      </Button>

      <ResponsiveModal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        ariaLabel="Заявка на путешествие"
      >
        <CorporateRequestForm subheading="Поможем подобрать подходящий тур." />
      </ResponsiveModal>
    </section>
  );
};
@reference "../../../app/globals.css";

.section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.head {
  max-width: 45rem;
  margin: 0 auto;
  text-align: center;
  color: var(--color-text-headings-2);
}

.grid {
  @apply lg:mt-15 lg:mb-11 mt-10 mb-10;
  display: grid;
  gap: 1.5rem;
}

.cta {
  align-self: center;
}

@media (min-width: 64rem) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

15. Для текста сделай копонент Typography и переиспользуй его в проекте, вот пример: 
"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

const typographyVariants = cva("", {
  variants: {
    type: {
      h1: "text-[1.5rem] sm:text-[2.25rem] md:text-[3rem] 2xl:text-[4rem] font-normal leading-[106%] text-text-headings-2",
      h2: "text-[1.5rem] md:text-[2.25rem] 2xl:text-[2.25rem] font-normal leading-1.1 text-text-headings-2",
      h3: "text-[1.25rem] md:text-[1.25rem] 2xl:text-[1.25rem] leading-1.2 text-text-headings-2",
      h4: "text-[1.25rem] md:text-[1.5rem] 2xl:text-[1.5rem] leading-1.2 text-text-headings-2",
      h5: "text-[1.5rem] md:text-[1.5rem] 2xl:text-[1.5rem] leading-1.2 text-text-headings-2",

      p1: "text-[0.875rem] md:text-[1rem] 2xl:text-[1rem] font-normal leading-1.2",
      p2: "text-[1rem] md:text-[1.25rem] 2xl:text-[1.25rem] font-normal leading-1.2",
      p3: "text-[1.25rem] md:text-[1.5rem] 2xl:text-[1.5rem] font-normal leading-1.2",
      p4: "text-[0.875rem] md:text-[0.875rem] 2xl:text-[0.875rem] font-normal leading-1.2",
      p5: "text-[1rem] md:text-[1rem] 2xl:text-[1rem] font-normal leading-1.2",
      p6: "text-[0.75rem] md:text-[0.75rem] 2xl:text-[0.75rem] font-normal leading-1.2",
    },
  },
  defaultVariants: {
    type: "p1",
  },
});

type Props = ComponentProps<"p"> &
  VariantProps<typeof typographyVariants> & { asChild?: boolean };

const tagByType = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  p1: "p",
  p2: "p",
  p3: "p",
  p4: "p",
  p5: "p",
  p6: "p",
};

export function Typography({
  className,
  type,
  asChild = false,
  ...props
}: Props) {
  const defaultTag = (type && tagByType[type]) || "p";
  const Comp = asChild ? Slot : defaultTag;

  return (
    <Comp className={cn(typographyVariants({ type, className }))} {...props} />
  );
}

16. Старайся создавать компоненты для переиспользования в проекте, например: 
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center py-3 px-3 uppercase cursor-pointer font-medium justify-center gap-2 whitespace-nowrap rounded-(--radius-3) text-base max-sm:text-sm transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        primary: "bg-primary text-text-body hover:bg-primary-hovered",
      },
      width: {
        sm: "w-full max-w-[10.875rem]",
        md: "w-full max-w-[21.5rem]",
        full: "w-full min-w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      width: "full",
    },
  },
);


function Button({
  className,
  variant,
  width,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({
          variant,
          width,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };

17. Все цвета выноси в глобальные переменные и переиспользуй в проекте не должно быть хардкод цветом и все размеры должны быть указаны в rem.

18. Декомпозируй крупные компоненты на более мелкие и переиспользуй их.         

19. Используй SOLID DRY KISS.