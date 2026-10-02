# Kernel Architect Constitution

## Project Vision

Kernel Architect is a browser game that teaches infrastructure design through interactive systems puzzles.

The game serves developers who want to understand traffic routing, service failures, recovery, and operational trade-offs.

The long-term outcome is a clear, playable simulation of infrastructure concepts with observable system behavior.

## Core Principles

- Keep simulation rules deterministic for the same level state and player actions.
- Keep rendering separate from simulation state and simulation decisions.
- Do not make game state depend on browser frame rate.
- Prefer direct client code over speculative frameworks or service layers.
- Keep current behavior as the specification scope. Do not add unimplemented product features.

## Technology Constraints

- Use TypeScript, React, Vite, and browser Canvas rendering.
- Ship the current game as a browser application.
- Keep the game as a single client application.
- Do not require a game engine, native runtime, or desktop packaging.
- Do not add accounts, cloud saves, multiplayer, payments, analytics, or network APIs.

## Architecture Constraints

- Keep game rules in simulation modules such as `src/game/sim.ts`.
- Keep level definitions and static game data in content modules such as `src/game/content.ts`.
- Keep React components responsible for input, view state, and rendering orchestration.
- Pass player actions into the simulation through explicit commands.
- Expose simulation results as state that the UI can render.
- Keep persistent browser data non-sensitive and local to the device.

## Testing Approaches

- Test routing, packet state, scoring, failures, and recovery with seeded inputs.
- Test each simulation rule without Canvas or React dependencies.
- Add regression cases for every corrected simulation defect.
- Verify the existing game behavior against documented acceptance checks.

## Coding Standards

- Use TypeScript for application and simulation code.
- Use explicit types for simulation state, commands, events, and level data.
- Keep simulation functions deterministic and free of browser rendering calls.
- Use stable names for game concepts across modules.
- Keep modules focused on one concern.
- Do not use `any` in changed simulation code.

## Security Constraints

- Do not collect or transmit player data.
- Do not store secrets, credentials, or payment data in the browser.
- Treat all browser storage as public to the local device user.
- Do not use external services in the current implementation.

## Performance Targets

- The game SHOULD maintain responsive play at 60 FPS on a current desktop browser during normal levels.
- Do not allocate transient simulation objects in the per-frame hot path.
- Keep simulation work independent from Canvas draw frequency.
- Avoid synchronous asset or data work during active play.

## Integration Points

- The current game has no external integration points.
- The current game uses the browser, React, Vite, TypeScript, and Canvas as local runtime dependencies.