---
name: immersive-interactive
title: "沉浸式互动"
metadata:
  publisher: NIE
description: Advanced, studio-quality interactive pages. Adds interaction depth (direct manipulation, linked views, guidance, correctness checks) and visual polish (cinematic motion, rich rendering and, where the idea is spatial, real-time 3D with Three.js) on top of the standard interactive pages. Use when the teacher asks for immersive, cinematic, 3D, animated, "wow" or very high-quality interactive content, or names this skill. Combine with nie-design for the NIE look. Slower and heavier than standard pages, so it suits courses with a few showcase interactions rather than many small ones.
---

# Immersive interactive course design

The course is carried by a small number of **showcase interactive pages**, each a
polished, fully animated mini web experience the learner explores. Slides frame
the question and consolidate; the interactive pages do the teaching.

## Structure

- Scene 1 is a `slide` that sets up the question and promises what the learner
  will explore.
- Then 2 to 4 `interactive` showcase pages, each isolating one mechanism, process
  or structure. Fewer, richer pages beat many thin ones: each one takes the
  generator a few minutes, so do not plan more than 4.
- Short `slide` pages may sit between showcases to carry an explanation the
  learner needs before the next exploration.
- Close with a `quiz` or a consolidating `slide`.
- Consecutive interactive pages must not share a `widgetType`.

## Choosing the widget type (and whether to use 3D)

Decide 3D on the merits of the idea, not for decoration:

- Use `visualization3d` when the concept is genuinely spatial: shapes and solids,
  orbits and the solar system, molecules and crystal lattices, anatomy, fields
  and waves in space, architecture, terrain, vectors in 3D.
- Use `simulation` for systems that change over time with variables to vary
  (it may still use a 3D view if depth helps understanding).
- Use `diagram` for processes, flows, cycles and hierarchies, rendered as an
  animated, explorable scene rather than boxes and arrows.
- Use `game` for repeated decisions under a rule, with a scored challenge.
- Use `code` only when the learner should read and run a program.

## widgetOutline

Fill it richly; it is the generator's whole brief.

- `concept` and, for simulations, `keyVariables` (the real controls).
- For 3D: `visualizationType`, the `objects` in the scene and the
  `interactions` the learner performs (orbit, pick, slice, explode, animate).
- Say in `keyPoints` what the learner does, what they see change, and the
  conclusion the observation forces.

## Scene naming

Titles name the experience: "Fly around the Moon's orbit", "Build a crystal
lattice", "Trace a nerve signal". Not topic headings.
