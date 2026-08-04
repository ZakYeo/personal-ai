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
- "Hey Jarvis, will I need a coat at home tomorrow morning?"
- "Hey Jarvis, watch for rain in Bristol tomorrow."
- "Hey Jarvis, add submit the form to my to-do list."
- "Hey Jarvis, remind me tomorrow at 9 to submit the form."

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
- Open prompts that ask the user to restate an incomplete request do not lock
  the next turn to an intent session. A reply to a specific clarification may
  answer it or replace it with one fresh request, while confirmations remain
  strict yes/no interactions. The application retains only safe clarification
  context and remains authoritative when provider continuation state conflicts
  with a validated workflow transition.

## Near-Term Direction

Compound plans, calendar result follow-ups, bounded calendar-to-alarm workflows,
bounded source-grounded internet search, and the Milestone 15 weather
implementation are present after their required independent maintainability
reviews. Milestone 16 is also implemented after its independent maintainability
review; it adds durable named lists,
revision-checked tasks, bounded result-reference follow-ups, and restart-safe
reminder delivery without treating delivery as task completion. Milestones 13
and 17 prioritize an explicit personal profile and proactive daily briefings.
The goal is a more personalized everyday assistant while preserving the
existing validation, confirmation, privacy, and runtime-boundary guarantees.
Smart-home control, a personal knowledge library, and adaptive memory remain
uncommitted future considerations.

The profile begins empty and is managed through normal text or voice requests
such as “set my name to Zak” and “what do you know about me?” The language model
may interpret those requests, but validated application commands and local
profile storage—not model memory or hardcoded configuration—own durable facts.
Weather uses Open-Meteo's key-free non-commercial API with required attribution.
Its current, hourly, and daily forecasts preserve exact location, timezone,
units, period, and freshness facts. Explicit weather watches persist local state,
claim delivery before output, and are convenience notifications rather than
guaranteed emergency alerts. A home default is available only through the
narrow explicit-profile reader; weather never infers it.
Personal tasks remain separate from alarms. A reminder is an optional lifecycle
on a task, is confirmed with its exact instant before persistence, and is
claimed before output. Speaking the reminder never silently completes the task.

## Documentation Maintenance

Keep this vision document aligned with the implemented product direction. Any codebase change that alters goals, non-goals, user-facing behavior, or product principles should update `README.md`, `AGENTS.md`, and the relevant `docs/` files in the same thin TDD slice.
