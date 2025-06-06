# Frontend Base

This is the base module for the frontend of the
[application](../../README.md#monorepo-structure).

## Table of Contents

- [Quick Start](#quick-start)
- [Libraries and Dependencies](#libraries-and-dependencies)
- [Repository Structure](#repository-structure)
- [Available Scripts](#available-scripts)
- [Modules](#modules)

## Quick Start

1. Navigate to the `packages/frontend-base` directory.
2. To run the frontend base in development mode:

```bash
bun run dev
```

## Libraries and Dependencies

- [open-props](https://open-props.style/): CSS custom properties to help
  accelerate adaptive and consistent design.
- [react](https://reactjs.org): A JavaScript library for building user
  interfaces.
- [react-dom](https://react.dev/reference/react-dom): Serves as the entry point
  to the DOM and server renderers for React and reconciles the rendered output.
- [framer-motion](https://www.framer.com/motion/): Powerful library to create
  animations for React.
- [react-feather](https://feathericons.com/): Icons library.
- [zod](https://zod.dev/) and [react-hook-form](https://react-hook-form.com/): Combined for form validations.
- [react-query](https://tanstack.com/query/v3/): Library to manage the asynchronous states of our queries.

## Repository Structure

```
|-- frontend-base/
|   |-- src/             # Main source code
|       |-- ui/          # Reusable React components
|       |-- auth/        # React components/templates related backend-base authentication
|       .
|       .
|       .
|       |-- utils/       # Helper utilities and functions
|-- index.ts             # Entry point of the module
```

## Available Scripts

| Command       | Action                                                                             |
| :------------ | :--------------------------------------------------------------------------------- |
| `bun run dev` | Starts the development server and type module generator for styles simultaneously. |

### Modules

#### General Philosophy

In the `src/` directory, our frontend architecture operates on a modular
structure that resembles "micro-frontends." This means that each major feature
of the application resides in its dedicated module. This allows for high
cohesion within modules and low coupling between them, enabling individual teams
to work on separate features with minimal overlap and ensuring that each module
is isolated from one another.

These feature-based modules can range from "Map," "Booking," and "Schedule" to
"Dashboard" and beyond. Despite the separation, there's one principle we
strictly adhere to: **Component Reusability**. All modules should strive to
reuse components from the `ui` folder, ensuring consistent UI/UX throughout the
application and avoiding redundancy.

#### Key Modules

- **UI**: This module contains reusable React components that are utilized
  across the application. Crafted with flexibility, efficiency, and modern
  design standards in mind, the components in this module serve as the building
  blocks for our frontend's UI.

- **Auth**: Responsible for everything related to authentication, this module
  contains React components and templates that interact with the `backend`
  authentication. It ensures secure access to our application's features.

- **Utils**: Houses functions and utilities that aid in crafting interfaces and
  executing business logic on the frontend. These utilities streamline common
  operations and ensure that our frontend logic remains DRY (Don't Repeat
  Yourself).
