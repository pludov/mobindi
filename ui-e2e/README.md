# UI end-to-end tests

Screenshot tests use two CSS classes to handle unstable or distracting content:

- `e2e-ignore` masks volatile content in screenshots; use it for values that change between runs.
- `e2e-hide` hides a component from screenshots. The test stylesheet sets `visibility: hidden`, preserving its layout.

Add these classes directly to UI components. The screenshot behavior is configured in `tests/tabs.spec.ts`.
