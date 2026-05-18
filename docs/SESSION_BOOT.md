# LoopThief Session Boot

# LoopThief Session Boot

Before making any code changes, read:

- docs/00_project_vision/LOOPTHIEF_DESIGN_BIBLE.md
- docs/01_development/DEVELOPMENT_ROADMAP.md
- docs/02_ai_rules/CODEX_COLLABORATION_RULES.md
- docs/02_ai_rules/MAREK_COLLABORATION_RULES.md

Core rules:
- Never replace AppShell.
- All screens render only inside LCD / LcdContent.
- Hardware shell is persistent.
- Utility buttons are workflows, not generic toggles.
- Hardware buttons are not the same as LCD softkeys.
- No full-screen overlays.
- No DAW/web dashboard UI.
- Preserve MPC/SP sampler workflow.

2. Important architecture rules:
- Never replace AppShell
- All screens render ONLY inside LCD content viewport
- Hardware shell is persistent
- Utility buttons are NOT generic toggles
- Hardware buttons != LCD softkeys
- Preserve MPC workflow mentality

3. UI rules:
- No DAW aesthetics
- No fullscreen overlays
- No modern web dashboard patterns
- No responsive app layouts
- Fixed hardware workstation feel

4. Workflow references:
- MPC2000XL
- MPC4000
- MPC1000 JJOS
- SP1200

5. Before implementing:
- inspect existing architecture first
- reuse current runtime systems
- avoid duplicate state systems