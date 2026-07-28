# Product Vision

## Purpose

Personal AI is a private, voice-activated assistant intended to feel like a smarter, configurable Alexa. It runs on a developer machine and has a dedicated Raspberry Pi service runtime without changing the assistant core. The repository now includes a tested systemd unit and operator guide for installation, upgrades, rollback, credentials, logs, and durable local state. Long-running voice services can schedule persistent one-shot, daily, and weekly alarms, recover them after restart, and deliver them through the configured speech path.

Terminal alarm history is retained locally for 30 days so recent outcomes remain available for inspection without allowing the state file to grow forever.

The assistant should support natural voice commands such as:

- "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?"
- "Hey Jarvis, can you respond to that WhatsApp message for me?"
- "Hey Jarvis, set an alarm to ping me in 10 minutes."
- "Hey Jarvis, check my upcoming events and set an alarm for 10 minutes to
  remind me to ask you again."
- "Hey Jarvis, remind me ten minutes before the second event."

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
- One utterance may request a small ordered plan, but the core must validate the
  whole plan, aggregate required confirmation, and stop on the first failed
  step. This is planned product behavior, not autonomous agent execution.
- An LLM may select at most two explicitly authorized read tools and ask one
  clarification before proposing a terminal action. Core validation and
  deterministic confirmation remain authoritative; this is not an open-ended
  agent loop.

## Near-Term Direction

Compound plans, calendar result follow-ups, and bounded calendar-to-alarm
workflows are implemented. Milestones 13 through 17 now prioritize an explicit
personal profile, source-grounded internet search, weather and forecast
watches, durable lists/tasks/reminders, and proactive daily briefings. The goal
is a more personalized everyday assistant while preserving the existing
validation, confirmation, privacy, and runtime-boundary guarantees. Smart-home
control, a personal knowledge library, and adaptive memory remain uncommitted
future considerations.

The profile begins empty and is managed through normal text or voice requests
such as “set my name to Zak” and “what do you know about me?” The language model
may interpret those requests, but validated application commands and local
profile storage—not model memory or hardcoded configuration—own durable facts.
Weather uses Open-Meteo's key-free non-commercial API with required attribution.

## Documentation Maintenance

Keep this vision document aligned with the implemented product direction. Any codebase change that alters goals, non-goals, user-facing behavior, or product principles should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
