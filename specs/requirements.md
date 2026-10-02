# Kernel Architect Requirements

## Overview

Kernel Architect is an as-is browser game about infrastructure systems.

A player completes interactive levels that model traffic routing, service failures, and recovery.

This specification records current behavior. It does not require new product features.

## User Roles

### Player

The player starts levels, changes the available controls, runs the simulation, and reads system feedback.

The player pauses or resets active play.

The player uses saved local progress and settings on the same browser device.

### Developer

The developer changes level content, simulation rules, and user interface behavior.

The developer verifies documented behavior with deterministic simulation tests and running-game checks.

## Functional Requirements

### FR-001: Level Selection

The system SHALL show the available game levels and their completion status.

**Acceptance criteria**

- When the player selects an available level, the system loads that level state and its goals.
- When the player returns to level selection, the system shows the saved completion state for each available level.

### FR-002: Level Topology

The system SHALL show the infrastructure topology, its nodes, links, and relevant state for the active level.

**Acceptance criteria**

- When a level starts, the player can identify its active components and connections.
- When a component changes state, the system updates the visible level state.

### FR-003: Player Controls

The system SHALL let the player use the controls that the active level exposes.

**Acceptance criteria**

- When the player changes a permitted routing or configuration control, the system applies the related simulation command.
- When a level does not permit an action, the system does not apply that action.
- When the player pauses the game, the system stops active simulation progress until play resumes.
- When the player resets the level, the system restores the defined initial state.

### FR-004: Simulation Execution

The system SHALL simulate traffic and infrastructure behavior from the level state and player commands.

**Acceptance criteria**

- When the player starts or resumes play, the simulation progresses from the current level state.
- Given the same initial state and command sequence, the simulation produces the same result.
- When a simulated failure occurs, the system updates the affected packet, service, and routing state.

### FR-005: System Feedback

The system SHALL show level goals, system status, events, and result feedback during play.

**Acceptance criteria**

- When the simulation generates a relevant event, the system shows feedback that identifies the event outcome.
- When the player meets a level goal, the system shows a completion result.
- When the player fails a level goal, the system shows the failure result and allows reset or retry.

### FR-006: Learning Content

The system SHALL show the current tutorial and explanatory text for the active level.

**Acceptance criteria**

- When a level begins, the system shows its learning objective and goal information.
- When the level state changes, the system shows the related current status or explanation.

### FR-007: Local Progress

The system SHALL save non-sensitive player progress and settings in browser-local storage.

**Acceptance criteria**

- When the player completes a level, the system records the completion state in local browser storage.
- When the player reloads the game in the same browser, the system restores valid saved progress and settings.
- When saved data is unavailable, the system starts with the default state.

## Non-Functional Requirements

### NFR-001: Deterministic Simulation

The simulation SHALL produce the same state transitions for the same initial state and command sequence.

### NFR-002: Responsive Local Play

The system SHALL process game controls without a required network connection or external service.

### NFR-003: Data Boundaries

The system SHALL keep player data on the local browser device.

The system SHALL NOT collect, transmit, or require personal data.

### NFR-004: Browser Performance

The game SHOULD maintain responsive play at 60 FPS in a current desktop browser during normal levels.

The simulation SHALL NOT depend on Canvas draw frequency.

## Data Requirements

The system manages level definitions, topology state, routing state, packet state, goals, events, scores, completion state, and player settings.

The system stores only non-sensitive progress and settings in browser-local storage.

The system treats saved browser data as untrusted and optional.

The system uses default state if it cannot read valid saved data.

## Integration Requirements

The current game has no external service, account, payment, analytics, cloud-save, multiplayer, or network API integration.

The game uses local browser runtime capabilities, React, TypeScript, Vite, and Canvas rendering.

The game uses browser-local storage for non-sensitive progress and settings only.