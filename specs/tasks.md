# Implementation Tasks: Kernel Architect

## Overview

This plan verifies and documents the current browser game.

The work starts with deterministic simulation checks.

The plan contains 7 medium tasks.

## Milestone 1: Infrastructure and Test Foundation

- [ ] 1\. Configure the deterministic simulation test harness
  - Add a TypeScript test command for pure modules in `src/game`.
  - Add helpers that create fixed initial states and command sequences.
  - Keep test execution independent from React, Canvas, and browser APIs.
  - Acceptance Criteria:
    - The test command runs from a clean local checkout.
    - A test can compare a complete next state and event list from fixed inputs.
  - _Dependencies: none_
  - _Requirements: NFR-001, NFR-002_
  - _Complexity: Medium_

- [ ] 2\. Verify route commands and packet transitions
  - Add unit tests for valid routing commands and resulting packet paths.
  - Add tests that reject unavailable or invalid level commands.
  - Use static level definitions from `src/game/content.ts`.
  - Acceptance Criteria:
    - The same initial state and valid route command produce the expected route and events.
    - An unavailable route command leaves the valid game state unchanged.
  - _Dependencies: 1_
  - _Requirements: FR-002, FR-003, FR-004, NFR-001_
  - _Complexity: Medium_

- [ ] 3\. Verify failure recovery scoring and goal rules
  - Add unit tests for component failure, recovery, score changes, and goal outcomes.
  - Add seeded regression cases for packet failure and successful level completion.
  - Assert each generated event that the UI uses for feedback.
  - Acceptance Criteria:
    - A simulated failure updates affected packet and service state as defined.
    - A recovery or goal-completion case produces the expected score, result, and event.
  - _Dependencies: 1_
  - _Requirements: FR-004, FR-005, FR-006, NFR-001_
  - _Complexity: Medium_

## Milestone 2: Core Player Flow Verification

- [ ] 4\. Verify level lifecycle controls
  - Add deterministic tests for level selection, start, pause, resume, and reset commands.
  - Verify reset returns the selected level to its defined initial state.
  - Verify pause prevents fixed-step progress until resume.
  - Acceptance Criteria:
    - A paused simulation does not change after one or more fixed steps.
    - Reset restores the defined initial topology, packet, goal, and score state.
  - _Dependencies: 1_
  - _Requirements: FR-001, FR-003, FR-004, NFR-001_
  - _Complexity: Medium_

- [ ] 5\. Verify UI feedback against simulation events
  - Inspect `src/App.tsx` and `src/ui` components for each documented player result.
  - Verify active goals, tutorial text, status, events, failure feedback, and completion feedback.
  - Record a manual browser check for each current level and control.
  - Acceptance Criteria:
    - The browser check shows a visible result for a simulated success and failure.
    - The active level shows its learning objective and current goal information.
  - _Dependencies: 2, 3, 4_
  - _Requirements: FR-001, FR-002, FR-003, FR-005, FR-006, NFR-002_
  - _Complexity: Medium_

## Milestone 3: Supporting Features

- [ ] 6\. Validate local progress and settings persistence
  - Identify the local profile schema and storage key in the current client.
  - Add tests for valid restore, unavailable storage, malformed data, and incompatible data.
  - Verify the client starts with default data after an invalid restore.
  - Acceptance Criteria:
    - Valid saved completion state and settings restore after a browser reload.
    - Malformed or incompatible saved data does not block game start and uses default data.
  - _Dependencies: 1, 4_
  - _Requirements: FR-007, NFR-002, NFR-003_
  - _Complexity: Medium_

## Milestone 4: Documentation

- [ ] 7\. Document local development and verification procedures
  - Update `README.md` with install, development, test, build, and static-hosting commands.
  - Document the deterministic test scope and the manual browser verification checklist.
  - State the local-only data boundary and the absence of external services.
  - Acceptance Criteria:
    - A developer can run the application, tests, and production build from the README.
    - The README lists the manual checks for selection, controls, results, and saved progress.
  - _Dependencies: 1, 5, 6_
  - _Requirements: NFR-001, NFR-002, NFR-003, NFR-004_
  - _Complexity: Medium_

## Dependency Graph

The critical path is task 1, task 2 or task 3, task 5, and task 7.

Tasks 2, 3, and 4 can proceed in parallel after task 1.

Task 6 can proceed after tasks 1 and 4.

Task 5 combines the verified simulation results with the current player interface.

Task 7 records the completed verification process and local delivery procedure.