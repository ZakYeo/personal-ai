# Product Vision

## Purpose

Personal AI is a private, voice-activated assistant intended to feel like a smarter, configurable Alexa. It runs on a developer machine and has a dedicated Raspberry Pi service runtime without changing the assistant core. Operator-friendly Raspberry Pi installation and service management remain planned work.

The assistant should support natural voice commands such as:

- "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?"
- "Hey Jarvis, can you respond to that WhatsApp message for me?"
- "Hey Jarvis, set an alarm to ping me in 10 minutes."

## Goals

- Provide a voice-activated personal assistant.
- Allow the assistant name, wake phrase, voice, providers, and enabled features to be configured.
- Support swappable AI/LLM providers through ports and adapters.
- Support pluggable features such as calendar, messaging, alarms, reminders, and future integrations.
- Run on a desktop computer for development and daily use.
- Run through a dedicated Raspberry Pi service runtime, with device operations
  hardened incrementally.
- Start with deterministic mock adapters and no external API calls.
- Keep the assistant core independent from audio devices, cloud providers, Raspberry Pi specifics, and third-party services.

## Non-Goals for the First Milestone

- Real LLM provider integration.
- Real speech-to-text or text-to-speech integration.
- Real Google Calendar, WhatsApp, or external service integration.
- Raspberry Pi deployment.
- A graphical interface.
- Persistent long-term memory.
- Autonomous actions with irreversible side effects.

## Product Principles

- The assistant should be configurable rather than hard-coded.
- Features should be easy to add without changing the core orchestration logic.
- The first version should be boring, deterministic, and heavily testable.
- Voice is an input/output adapter around the assistant, not the center of the architecture.
- The LLM should assist with interpretation and response generation, but the core should validate structured commands before side effects occur.

## Documentation Maintenance

Keep this vision document aligned with the implemented product direction. Any codebase change that alters goals, non-goals, user-facing behavior, or product principles should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
