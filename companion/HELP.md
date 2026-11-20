# B_inPlay

Steuert den Video-Cue-Player B_inPlay (edyds medienproduktion) per HTTP.

## Einrichten

1. B_inPlay starten. Unten im Fenster steht die Adresse, z. B. `mein-mac.local:8100`.
2. In Companion eine Verbindung „B_inPlay“ anlegen, IP-Adresse des Macs und Port 8100 eintragen. Läuft Companion auf demselben Mac, genügt `127.0.0.1`.
3. Unter „Presets“ liegen fertige Tasten: **Show** (vorherige Gruppe, vorheriger Cue, Play/Pause, nächster Cue, nächste Gruppe, Take, Stopp, Reset, „all“, Frame zurück / vor, Freeze all, Augen), Player 1–3 (Restzeit, Stopp, Fade out, Von vorn, Reset, In setzen, Out setzen, In/Out löschen, letzte 10 s / 30 s, NDI), Alle, Blackout, jeder Cue und jede Gruppe.

## Aktionen

**Show:** Nächster / Vorheriger Cue · **Take** (spielt wie die Enter-Taste den nach einem Freeze vorgewählten Cue, sonst den nächsten der Liste) · Nächste / Vorherige Gruppe · Cue zum Anfang springen (Reset) · Alle wiederholen („all“) · **Freeze all** (jeder Clip bleibt am Ende stehen, der nächste Cue wird angewählt) · **Einzelbild vor / zurück** (bei Pause, auf dem Player des in B_inPlay markierten Cues, wie die Pfeiltasten ← →; Anzahl Bilder wählbar, auch als Player-Aktion für einen bestimmten Player) · Augen-Animation · Alle: Start/Pause, Stopp, Fade out · Blackout.
**Player:** Start/Pause, Weiterspielen, Pause, Stopp, Fade out, Von vorn, Zum Anfang springen (Reset), in die letzten … Sekunden springen · **In setzen / Out setzen** an der aktuellen Position, In und Out löschen, **Trim an/aus** (ohne Trim laufen die Cues komplett, die Punkte bleiben gespeichert) · **Stumm** pro Player · NDI pro Player. **Show:** zusätzlich **Testbild** an/aus (Testbild auf allen Outputs).

In und Out gelten für den Cue, der auf dem Player läuft; Restzeit, Fortschritt und „letzte … Sekunden“ beziehen sich dann auf den Ausschnitt (In bis Out).
**Cue abspielen · Gruppe starten.**

„Nächster/Vorheriger Cue“ folgen der Reihenfolge der Liste in B_inPlay (erst die Cues ohne Gruppe, dann die Gruppen); „Nächste/Vorherige Gruppe“ wechseln die Gruppe und blenden Reste der bisherigen aus.

## Feedbacks

Player spielt / pausiert / hat einen Cue / Restzeit unter X Sekunden / ist vorhanden · Cue läuft · Gruppe läuft · Blackout · Alle wiederholen ist an · Freeze all ist an · Augen-Animation ist an · NDI sendet · Verbunden.

## Variablen

`p1_cue`, `p1_state`, `p1_remaining`, `p1_elapsed`, `p1_progress`, `p1_ndi` (ebenso `p2_…`, `p3_…`), `active_players` (so viele Player wie Outputs), `blackout`, `repeat_all`, `freeze_all`, `idle_eye`, `current_cue_number`, `current_cue_name`, `current_group_number`, `current_group_name`, `cue_count`, `group_count`, `cue_<n>_name`, `group_<n>_name` (dazu `cue_<n>_short`, `group_<n>_short`, `p1_cue_short` …: Namen für Tasten gekürzt).

Die Cue- und Gruppennummern entsprechen der Reihenfolge in B_inPlay (zuerst die Liste ohne Gruppe, wie sie im Programm gespeichert ist). Ändert sich die Liste, aktualisieren sich Auswahllisten und Presets von selbst.
