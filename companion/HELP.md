# B_inPlay

Controls the video cue player B_inPlay (edyds medienproduktion) over HTTP.

> Note: the action, feedback and preset names inside Companion are currently shown in German. This page describes them in English.

## Setup

1. Start B_inPlay. The address is shown at the bottom of the window, e.g. `my-mac.local:8100`.
2. In Companion, add a connection "B_inPlay" and enter the IP address of the Mac and port 8100. If Companion runs on the same Mac, `127.0.0.1` is enough.
3. Under "Presets" you will find ready-made buttons:
   - **Show:** previous group, previous cue, play/pause, next cue, next group, Take, stop, reset, "all", frame back / forward, Freeze all, eyes.
   - **Player 1–3:** remaining time, stop, fade out, restart, set In, set Out, clear In/Out, last 10 s / 30 s, NDI.
   - **All**, **Blackout**, and one button for every cue and every group.

## Actions

**Show:** next / previous cue · **Take** (like the Enter key: plays the cue preselected after a Freeze, otherwise the next one in the list) · next / previous group · jump a cue to its start (reset) · repeat all ("all") · **Freeze all** (every clip stays on its last frame and the next cue is selected) · **frame forward / back** (while paused, on the player of the cue selected in B_inPlay, like the ← → arrow keys; number of frames selectable, also available as a player action for a specific player) · eye animation · All: play/pause, stop, fade out · Blackout · **test pattern** on/off (on all outputs).

**Player:** play/pause, resume, pause, stop, fade out, restart, jump to start (reset), jump to the last … seconds · **set In / set Out** at the current position, clear In and Out, **Trim on/off** (without trim the cues play in full, the points stay stored) · **Mute** per player · NDI per player.

**Cue and group:** play cue · start group.

In and Out apply to the cue running on the player. Remaining time, progress and "last … seconds" then refer to the selected section (In to Out).

"Next / previous cue" follow the order of the list in B_inPlay (first the cues without a group, then the groups). "Next / previous group" switch the group and fade out what remains of the previous one.

## Feedbacks

Player is playing / paused / has a cue / remaining time under X seconds / exists · cue is running · group is running · Blackout · repeat all is on · Freeze all is on · eye animation is on · NDI is sending · Connected.

## Variables

`p1_cue`, `p1_state`, `p1_remaining`, `p1_elapsed`, `p1_progress`, `p1_ndi` (and the same for `p2_…`, `p3_…`), `active_players` (as many players as outputs), `blackout`, `repeat_all`, `freeze_all`, `idle_eye`, `current_cue_number`, `current_cue_name`, `current_group_number`, `current_group_name`, `cue_count`, `group_count`, `cue_<n>_name`, `group_<n>_name`. Shortened names for buttons: `cue_<n>_short`, `group_<n>_short`, `p1_cue_short` …

Cue and group numbers follow the order in B_inPlay (first the list without a group, as saved in the program). When the list changes, selection lists and presets update automatically.
