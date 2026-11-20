// Bitfocus Companion – Modul für B_inPlay (edyds medienproduktion)
// Spricht die HTTP-Schnittstelle von B_inPlay an (Standard-Port 8100) und fragt den Status regelmäßig ab.

const { InstanceBase, InstanceStatus, Regex, combineRgb, runEntrypoint } = require('@companion-module/base')
const ICONS = require('./icons.js') // Tastenbilder „Freeze all“ und „Loop all“: dieselben Symbole wie im Programm (Tools/make-icons.swift)

// Farben. Das helle Blau (Zustand „an“, mit schwarzer Schrift), Gold (Take), Magenta (Stopp) und das dunkle Blau der
// Cue- und Gruppentasten (mit weißer Schrift) stammen aus dem edyds-Logo bzw. der App.
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const GREY = combineRgb(51, 51, 51)
const GREEN = combineRgb(19, 163, 60)
const DARKGREEN = combineRgb(11, 77, 31)
const ORANGE = combineRgb(255, 159, 10)
const RED = combineRgb(255, 69, 58)
const DARKRED = combineRgb(110, 18, 18)
const BLUE = combineRgb(20, 171, 227)
const CUEBLUE = combineRgb(12, 98, 140)
const GOLD = combineRgb(230, 181, 18)
const MAGENTA = combineRgb(233, 31, 125)

/** Name für Tasten kürzen: eine 72-px-Taste fasst bei Schriftgröße 14 etwa 9 Zeichen pro Zeile und 4 Zeilen. */
function short(text, max) {
	const t = String(text ?? '').replace(/\s+/g, ' ').trim()
	return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

/** Zahl aus einer Option: gerundet, mindestens `min`, höchstens `max`; bei ungültiger Eingabe `fallback`. */
const clampInt = (value, min, max, fallback) => Math.min(max, Math.max(min, Math.round(Number(value) || fallback)))

/** HTTP-Pfad für den Bildschritt (ohne Player-Präfix): frame/next|prev/<1–100> */
const frameCommand = (o) => `frame/${o.dir === 'prev' ? 'prev' : 'next'}/${clampInt(o.frames, 1, 100, 1)}`

const PLAYERS = [1, 2, 3].map((n) => ({ id: n, label: `Player ${n}` }))
const ON_OFF_TOGGLE = [
	{ id: 'toggle', label: 'Umschalten' },
	{ id: 'on', label: 'An' },
	{ id: 'off', label: 'Aus' },
]

class BInPlayInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.state = {}
		this.pollTimer = null
		this.polling = false
		this.connected = null
		this.listSignature = ''
	}

	async init(config) {
		this.config = config
		this.updateStatus(InstanceStatus.Connecting)
		this.updateDefinitions()
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
	}

	async configUpdated(config) {
		this.config = config
		this.connected = null
		this.updateStatus(InstanceStatus.Connecting)
		this.stopPolling()
		this.updateDefinitions()
		this.startPolling()
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Hinweis',
				value:
					'Steuert B_inPlay über das lokale Netzwerk. Die Adresse des Macs steht in B_inPlay unten neben „Companion“. Läuft Companion auf demselben Mac, reicht 127.0.0.1.',
			},
			{ type: 'textinput', id: 'host', label: 'IP-Adresse des Macs', width: 8, default: '127.0.0.1', regex: Regex.HOSTNAME },
			{ type: 'number', id: 'port', label: 'Port', width: 4, default: 8100, min: 1, max: 65535 },
			{ type: 'number', id: 'interval', label: 'Abfrage alle … ms', width: 4, default: 400, min: 100, max: 5000 },
		]
	}

	// ---------------------------------------------------------------- Netzwerk

	baseUrl() {
		const host = (this.config?.host || '127.0.0.1').trim()
		const port = Number(this.config?.port) || 8100
		return `http://${host}:${port}`
	}

	async request(path) {
		const url = `${this.baseUrl()}/${path.replace(/^\/+/, '')}`
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(2000), cache: 'no-store' })
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			this.applyStatus(await res.json())
			return true
		} catch (e) {
			this.setDisconnected(e)
			return false
		}
	}

	startPolling() {
		const interval = Math.max(100, Number(this.config?.interval) || 400)
		const tick = async () => {
			if (this.polling) return
			this.polling = true
			try {
				await this.request('status')
			} finally {
				this.polling = false
			}
		}
		this.pollTimer = setInterval(tick, interval)
		tick()
	}

	stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer)
		this.pollTimer = null
	}

	setDisconnected(e) {
		if (this.connected !== false) {
			this.connected = false
			const msg =
				e?.name === 'TimeoutError'
					? 'Zeitüberschreitung'
					: e?.message === 'fetch failed'
						? 'keine Verbindung (läuft B_inPlay? IP/Port richtig?)'
						: String(e?.message || e)
			this.updateStatus(InstanceStatus.ConnectionFailure, msg)
			this.log('warn', `B_inPlay unter ${this.baseUrl()} nicht erreichbar: ${msg}`)
			// Nicht weiter „läuft“ anzeigen: Player und Schalter zurücksetzen, Cue- und Gruppenlisten bleiben für die Tasten
			this.state = {
				cues: (this.state.cues || []).map((c) => ({ ...c, running: false })),
				groups: (this.state.groups || []).map((g) => ({ ...g, running: false })),
			}
			this.updateVariableValues()
			this.checkFeedbacks()
		}
	}

	applyStatus(s) {
		if (!s || typeof s !== 'object') return
		if (this.connected !== true) {
			this.connected = true
			this.updateStatus(InstanceStatus.Ok)
			this.log('info', `Verbunden mit B_inPlay unter ${this.baseUrl()}`)
		}
		this.state = s

		// Cues oder Gruppen geändert → Auswahllisten, Variablen und Presets aktualisieren
		const sig = JSON.stringify([
			(s.cues || []).map((c) => [c.name, c.player, c.group]),
			(s.groups || []).map((g) => g.name),
		])
		if (sig !== this.listSignature) {
			this.listSignature = sig
			this.updateDefinitions()
		}

		this.updateVariableValues()
		this.checkFeedbacks()
	}

	player(n) {
		return (this.state.players || []).find((p) => p.player === Number(n))
	}

	// ---------------------------------------------------------------- Definitionen

	updateDefinitions() {
		this.setActionDefinitions(this.actionDefinitions())
		this.setFeedbackDefinitions(this.feedbackDefinitions())
		this.setVariableDefinitions(this.variableDefinitions())
		this.setPresetDefinitions(this.presetDefinitions())
		this.updateVariableValues()
	}

	cueChoices() {
		const cues = this.state.cues || []
		if (cues.length === 0) return Array.from({ length: 10 }, (_, i) => ({ id: i + 1, label: `Cue ${i + 1}` }))
		return cues.map((c) => ({ id: c.number, label: `${c.number}: ${c.name}${c.group ? ` (${c.group})` : ''}` }))
	}

	groupChoices() {
		const groups = this.state.groups || []
		if (groups.length === 0) return Array.from({ length: 4 }, (_, i) => ({ id: i + 1, label: `Gruppe ${i + 1}` }))
		return groups.map((g) => ({ id: g.number, label: `${g.number}: ${g.name}` }))
	}

	cueOption() {
		const choices = this.cueChoices()
		return { type: 'dropdown', id: 'index', label: 'Cue', default: choices[0]?.id ?? 1, choices, allowCustom: true }
	}

	groupOption() {
		const choices = this.groupChoices()
		return { type: 'dropdown', id: 'index', label: 'Gruppe', default: choices[0]?.id ?? 1, choices, allowCustom: true }
	}

	actionDefinitions() {
		const simple = (name, path) => ({ name, options: [], callback: async () => void (await this.request(path)) })
		const playerOpt = { type: 'dropdown', id: 'player', label: 'Player', default: 1, choices: PLAYERS }
		const onPlayer = (name, cmd) => ({
			name,
			options: [playerOpt],
			callback: async (a) => void (await this.request(`p/${a.options.player}/${cmd}`)),
		})

		return {
			toggle_all: simple('Alle: Start / Pause umschalten', 'toggle'),
			stop_all: simple('Alle: Stopp', 'stop'),
			fade_all: simple('Alle: Fade out', 'fade'),
			reset_all: simple('Alle: Cue zum Anfang springen (Reset)', 'reset'),

			next_cue: simple('Show: Nächster Cue', 'cue/next'),
			prev_cue: simple('Show: Vorheriger Cue', 'cue/prev'),
			take: {
				name: 'Show: Take (vorgewählten Cue abspielen)',
				description: 'Wie die Enter-Taste: spielt den nach einem Freeze vorgewählten Cue, sonst den nächsten der Liste.',
				options: [],
				callback: async () => void (await this.request('cue/take')),
			},
			next_group: simple('Show: Nächste Gruppe', 'group/next'),
			prev_group: simple('Show: Vorherige Gruppe', 'group/prev'),
			repeat_all: {
				name: 'Alle wiederholen („all“)',
				description: 'Nach dem letzten Cue beginnt die Liste von vorn.',
				options: [{ type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`repeat/${a.options.mode}`)),
			},
			frame_step: {
				name: 'Show: Einzelbild vor / zurück (markierter Cue, bei Pause)',
				description: 'Wie die Pfeiltasten ← →: wirkt auf den Player, auf dem der markierte Cue geladen ist (sonst der laufende bzw. erste mit Clip). Nur bei Pause.',
				options: [
					{ type: 'dropdown', id: 'dir', label: 'Richtung', default: 'next', choices: [{ id: 'next', label: 'Vor' }, { id: 'prev', label: 'Zurück' }] },
					{ type: 'number', id: 'frames', label: 'Bilder', default: 1, min: 1, max: 100 },
				],
				callback: async (a) => void (await this.request(frameCommand(a.options))),
			},
			player_frame_step: {
				name: 'Player: Einzelbild vor / zurück (bei Pause)',
				options: [
					playerOpt,
					{ type: 'dropdown', id: 'dir', label: 'Richtung', default: 'next', choices: [{ id: 'next', label: 'Vor' }, { id: 'prev', label: 'Zurück' }] },
					{ type: 'number', id: 'frames', label: 'Bilder', default: 1, min: 1, max: 100 },
				],
				callback: async (a) => void (await this.request(`p/${a.options.player}/${frameCommand(a.options)}`)),
			},
			freeze_all: {
				name: 'Freeze all (Clips bleiben am Ende stehen)',
				description: 'Jeder Clip hält am Ende mit dem letzten Bild an, der nächste Cue wird angewählt (Take spielt ihn ab).',
				options: [{ type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`freeze/${a.options.mode}`)),
			},
			idle_eye: {
				name: 'Augen-Animation (Outputs ohne Clip)',
				options: [{ type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`eye/${a.options.mode}`)),
			},

			player_toggle: onPlayer('Player: Start / Pause umschalten', 'toggle'),
			player_play: onPlayer('Player: Weiterspielen', 'play'),
			player_pause: onPlayer('Player: Pause', 'pause'),
			player_stop: onPlayer('Player: Stopp', 'stop'),
			player_fade: onPlayer('Player: Fade out', 'fade'),
			player_restart: onPlayer('Player: Von vorn', 'restart'),
			player_reset: onPlayer('Player: Zum Anfang springen (Wiedergabe/Pause bleibt)', 'reset'),
			player_in: onPlayer('Player: In setzen (an der aktuellen Position)', 'in'),
			player_out: onPlayer('Player: Out setzen (an der aktuellen Position)', 'out'),
			testbild: {
				name: 'Testbild auf allen Outputs',
				options: [{ type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`testbild/${a.options.mode}`)),
			},
			player_mute: {
				name: 'Player: Stumm schalten',
				options: [playerOpt, { type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`p/${a.options.player}/mute/${a.options.mode}`)),
			},
			player_trim: {
				name: 'Player: Trim an / aus (In und Out beachten)',
				options: [playerOpt, { type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`p/${a.options.player}/trim/${a.options.mode}`)),
			},
			player_trim_clear: onPlayer('Player: In und Out löschen (ganzer Clip)', 'trim/clear'),
			player_last: {
				name: 'Player: In die letzten … Sekunden des Clips springen',
				options: [
					playerOpt,
					{ type: 'number', id: 'seconds', label: 'Sekunden vor dem Ende', default: 10, min: 1, max: 600 },
				],
				callback: async (a) => void (await this.request(`p/${a.options.player}/last/${clampInt(a.options.seconds, 1, Infinity, 10)}`)),
			},

			cue: {
				name: 'Cue abspielen',
				description: 'Der Cue läuft auf dem Player, der ihm in B_inPlay zugewiesen ist.',
				options: [this.cueOption()],
				callback: async (a) => void (await this.request(`cue/${clampInt(a.options.index, 1, Infinity, 1)}`)),
			},

			group: {
				name: 'Gruppe starten',
				options: [this.groupOption()],
				callback: async (a) => void (await this.request(`group/${clampInt(a.options.index, 1, Infinity, 1)}`)),
			},

			blackout: {
				name: 'Blackout',
				options: [{ type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`blackout/${a.options.mode}`)),
			},

			ndi: {
				name: 'NDI-Output eines Players',
				options: [playerOpt, { type: 'dropdown', id: 'mode', label: 'Aktion', default: 'toggle', choices: ON_OFF_TOGGLE }],
				callback: async (a) => void (await this.request(`ndi/${a.options.player}/${a.options.mode}`)),
			},
		}
	}

	feedbackDefinitions() {
		const bool = (name, description, defaultStyle, check, options = []) => ({
			type: 'boolean',
			name,
			description,
			defaultStyle,
			options,
			callback: (fb) => !!check(fb),
		})
		const playerOpt = { type: 'dropdown', id: 'player', label: 'Player', default: 1, choices: PLAYERS }

		return {
			player_playing: bool('Player spielt', 'Aktiv, solange der Player läuft', { bgcolor: GREEN, color: WHITE }, (fb) => this.player(fb.options.player)?.playing, [playerOpt]),
			player_paused: bool(
				'Player pausiert',
				'Aktiv, wenn ein Cue geladen ist, aber angehalten wurde',
				{ bgcolor: ORANGE, color: BLACK },
				(fb) => {
					const p = this.player(fb.options.player)
					return p && p.cueIndex > 0 && !p.playing
				},
				[playerOpt]
			),
			player_loaded: bool('Player hat einen Cue', '', { bgcolor: DARKGREEN, color: WHITE }, (fb) => (this.player(fb.options.player)?.cueIndex || 0) > 0, [playerOpt]),
			player_ending: bool(
				'Player: Restzeit unter … Sekunden',
				'Zum Warnen kurz vor dem Ende eines Clips',
				{ bgcolor: RED, color: WHITE },
				(fb) => {
					const p = this.player(fb.options.player)
					return p && p.playing && p.duration > 0 && p.remaining <= Number(fb.options.seconds)
				},
				[playerOpt, { type: 'number', id: 'seconds', label: 'Sekunden', default: 10, min: 1, max: 600 }]
			),
			cue_running: bool(
				'Cue läuft',
				'Aktiv, wenn der gewählte Cue gerade auf einem Player läuft',
				{ bgcolor: GREEN, color: WHITE },
				(fb) => !!(this.state.cues || []).find((c) => c.number === Number(fb.options.index))?.running,
				[this.cueOption()]
			),
			group_running: bool(
				'Gruppe läuft',
				'Aktiv, wenn mindestens ein Cue der Gruppe läuft',
				{ bgcolor: GREEN, color: WHITE },
				(fb) => !!(this.state.groups || []).find((g) => g.number === Number(fb.options.index))?.running,
				[this.groupOption()]
			),
			blackout: bool('Blackout aktiv', '', { bgcolor: DARKRED, color: WHITE }, () => this.state.blackout),
			repeat_all: bool('Alle wiederholen ist an', '', { bgcolor: BLUE, color: BLACK }, () => this.state.repeatAll),
			freeze_all: bool('Freeze all ist an', 'Aktiv, wenn alle Clips am Ende stehen bleiben', { bgcolor: ORANGE, color: BLACK }, () => this.state.freezeAll),
			idle_eye: bool('Augen-Animation ist an', '', { bgcolor: GREEN, color: WHITE }, () => this.state.idleEye),
			testbild: bool('Testbild läuft', 'Aktiv, solange das Testbild auf den Outputs läuft', { bgcolor: ORANGE, color: BLACK }, () => this.state.testPattern),
			player_muted: bool('Player ist stumm', '', { bgcolor: RED, color: WHITE }, (fb) => this.player(fb.options.player)?.muted, [playerOpt]),
			player_trim: bool('Trim ist an', 'Aktiv, wenn In/Out der Cues auf diesem Player beachtet werden', { bgcolor: BLUE, color: BLACK }, (fb) => this.player(fb.options.player)?.trim, [playerOpt]),
			player_active: bool('Player ist vorhanden', 'Es gibt so viele Player wie Outputs', { bgcolor: DARKGREEN, color: WHITE }, (fb) => Number(fb.options.player) <= (this.state.activePlayers || 1), [playerOpt]),
			ndi: bool('NDI sendet', 'Aktiv, wenn der Player als NDI-Quelle sendet', { bgcolor: BLUE, color: BLACK }, (fb) => this.player(fb.options.player)?.ndi, [playerOpt]),
			connected: bool('Verbunden', 'Aktiv, wenn B_inPlay erreichbar ist', { bgcolor: GREEN, color: WHITE }, () => this.connected === true),
		}
	}

	variableDefinitions() {
		const defs = [
			{ variableId: 'blackout', name: 'Blackout (true/false)' },
			{ variableId: 'cue_count', name: 'Anzahl Cues' },
			{ variableId: 'group_count', name: 'Anzahl Gruppen' },
			{ variableId: 'active_players', name: 'Anzahl Player (so viele wie Outputs)' },
			{ variableId: 'repeat_all', name: 'Alle wiederholen (true/false)' },
			{ variableId: 'freeze_all', name: 'Freeze all (true/false)' },
			{ variableId: 'idle_eye', name: 'Augen-Animation (true/false)' },
			{ variableId: 'current_cue_number', name: 'Aktueller Cue: Nummer (0 = keiner)' },
			{ variableId: 'current_cue_name', name: 'Aktueller Cue: Name' },
			{ variableId: 'current_group_number', name: 'Aktuelle Gruppe: Nummer (0 = keine)' },
			{ variableId: 'current_group_name', name: 'Aktuelle Gruppe: Name' },
		]
		for (const n of [1, 2, 3]) {
			defs.push(
				{ variableId: `p${n}_cue`, name: `Player ${n}: Cue-Name` },
				{ variableId: `p${n}_cue_short`, name: `Player ${n}: Cue-Name gekürzt (für Tasten)` },
				{ variableId: `p${n}_cue_number`, name: `Player ${n}: Cue-Nummer (0 = leer)` },
				{ variableId: `p${n}_state`, name: `Player ${n}: Status (Playing, Paused, Stopped)` },
				{ variableId: `p${n}_remaining`, name: `Player ${n}: Restzeit mm:ss` },
				{ variableId: `p${n}_elapsed`, name: `Player ${n}: Gelaufen mm:ss` },
				{ variableId: `p${n}_progress`, name: `Player ${n}: Fortschritt in Prozent` },
				{ variableId: `p${n}_ndi`, name: `Player ${n}: NDI (true/false)` }
			)
		}
		for (const c of this.state.cues || []) {
			defs.push({ variableId: `cue_${c.number}_name`, name: `Cue ${c.number}: Name` })
			defs.push({ variableId: `cue_${c.number}_short`, name: `Cue ${c.number}: Name gekürzt (für Tasten)` })
		}
		for (const g of this.state.groups || []) {
			defs.push({ variableId: `group_${g.number}_name`, name: `Gruppe ${g.number}: Name` })
			defs.push({ variableId: `group_${g.number}_short`, name: `Gruppe ${g.number}: Name gekürzt (für Tasten)` })
		}
		return defs
	}

	updateVariableValues() {
		const s = this.state || {}
		const values = {
			blackout: !!s.blackout,
			cue_count: (s.cues || []).length,
			group_count: (s.groups || []).length,
			active_players: s.activePlayers ?? 1,
			repeat_all: !!s.repeatAll,
			freeze_all: !!s.freezeAll,
			idle_eye: !!s.idleEye,
			current_cue_number: s.currentCue ?? 0,
			current_cue_name: (s.cues || []).find((c) => c.number === s.currentCue)?.name ?? '',
			current_group_number: s.currentGroup ?? 0,
			current_group_name: (s.groups || []).find((g) => g.number === s.currentGroup)?.name ?? '',
		}
		for (const n of [1, 2, 3]) {
			const p = this.player(n)
			values[`p${n}_cue`] = p?.cue ?? ''
			values[`p${n}_cue_short`] = short(p?.cue, 18)
			values[`p${n}_cue_number`] = p?.cueIndex ?? 0
			values[`p${n}_state`] = !p || !p.cueIndex ? 'Stopped' : p.playing ? 'Playing' : 'Paused'
			values[`p${n}_remaining`] = p && p.cueIndex ? p.time : '--:--'
			values[`p${n}_elapsed`] = p && p.cueIndex ? p.elapsed : '--:--'
			values[`p${n}_progress`] = Math.round(p?.progress ?? 0)
			values[`p${n}_ndi`] = !!p?.ndi
		}
		for (const c of s.cues || []) {
			values[`cue_${c.number}_name`] = c.name
			values[`cue_${c.number}_short`] = short(c.name, 24)
		}
		for (const g of s.groups || []) {
			values[`group_${g.number}_name`] = g.name
			values[`group_${g.number}_short`] = short(g.name, 18)
		}
		this.setVariableValues(values)
	}

	presetDefinitions() {
		const v = (id) => `$(${this.label}:${id})`
		const presets = {}
		const button = (id, category, name, text, actionId, options = {}, feedbacks = [], style = {}) => {
			presets[id] = {
				type: 'button',
				category,
				name,
				style: { text, size: '14', color: WHITE, bgcolor: BLACK, ...style },
				steps: [{ down: [{ actionId, options }], up: [] }],
				feedbacks,
			}
		}

		for (const n of [1, 2, 3]) {
			button(`p${n}_time`, `Player ${n}`, `Player ${n}: Restzeit (Start/Pause)`, `P${n}\n${v(`p${n}_remaining`)}\n${v(`p${n}_cue_short`)}`, 'player_toggle', { player: n }, [
				{ feedbackId: 'player_playing', options: { player: n }, style: { bgcolor: DARKGREEN, color: WHITE } },
				{ feedbackId: 'player_paused', options: { player: n }, style: { bgcolor: ORANGE, color: BLACK } },
				{ feedbackId: 'player_ending', options: { player: n, seconds: 10 }, style: { bgcolor: RED, color: WHITE } },
			])
			button(`p${n}_stop`, `Player ${n}`, `Player ${n}: Stopp`, `P${n}\nSTOPP`, 'player_stop', { player: n }, [], { bgcolor: MAGENTA })
			button(`p${n}_fade`, `Player ${n}`, `Player ${n}: Fade out`, `P${n}\nFADE\nOUT`, 'player_fade', { player: n })
			button(`p${n}_restart`, `Player ${n}`, `Player ${n}: Von vorn`, `P${n}\n↺ VON\nVORN`, 'player_restart', { player: n })
			button(`p${n}_reset`, `Player ${n}`, `Player ${n}: Zum Anfang springen`, `P${n}\n↺\nRESET`, 'player_reset', { player: n })
			button(`p${n}_in`, `Player ${n}`, `Player ${n}: In setzen`, `P${n}\nIN\nSETZEN`, 'player_in', { player: n })
			button(`p${n}_out`, `Player ${n}`, `Player ${n}: Out setzen`, `P${n}\nOUT\nSETZEN`, 'player_out', { player: n })
			button(`p${n}_trim`, `Player ${n}`, `Player ${n}: Trim an/aus`, `P${n}\nTRIM\nAN/AUS`, 'player_trim', { player: n, mode: 'toggle' }, [
				{ feedbackId: 'player_trim', options: { player: n }, style: { bgcolor: BLUE, color: BLACK } },
			])
			button(`p${n}_mute`, `Player ${n}`, `Player ${n}: Stumm an/aus`, `P${n}\n🔇\nSTUMM`, 'player_mute', { player: n, mode: 'toggle' }, [
				{ feedbackId: 'player_muted', options: { player: n }, style: { bgcolor: RED, color: WHITE } },
			])
			button(`p${n}_trimclear`, `Player ${n}`, `Player ${n}: In/Out löschen`, `P${n}\nIN/OUT\nLÖSCHEN`, 'player_trim_clear', { player: n })
			button(`p${n}_last30`, `Player ${n}`, `Player ${n}: letzte 30 s`, `P${n}\nLETZTE\n30 s`, 'player_last', { player: n, seconds: 30 })
			button(`p${n}_last10`, `Player ${n}`, `Player ${n}: letzte 10 s`, `P${n}\nLETZTE\n10 s`, 'player_last', { player: n, seconds: 10 })
			button(`p${n}_ndi`, `Player ${n}`, `Player ${n}: NDI an/aus`, `NDI\nP${n}`, 'ndi', { player: n, mode: 'toggle' }, [
				{ feedbackId: 'ndi', options: { player: n }, style: { bgcolor: BLUE, color: BLACK } },
			], { bgcolor: GREY })
		}

		// Show-Steuerung wie die großen Knöpfe im Programmfenster
		button('show_prev_group', 'Show', 'Vorherige Gruppe', '⏮ Gruppe', 'prev_group')
		button('show_prev_cue', 'Show', 'Vorheriger Cue', '◀\nCUE', 'prev_cue')
		button('show_toggle', 'Show', 'Play / Pause', '⏯\nSHOW', 'toggle_all', {}, [])
		button('show_next_cue', 'Show', 'Nächster Cue', '▶\nCUE', 'next_cue')
		button('show_take', 'Show', 'Take (vorgewählten Cue abspielen)', 'TAKE', 'take', {}, [], { bgcolor: GOLD, color: BLACK })
		button('show_next_group', 'Show', 'Nächste Gruppe', '⏭ Gruppe', 'next_group')
		button('show_stop', 'Show', 'Alles stoppen', '⏹\nSTOPP', 'stop_all', {}, [], { bgcolor: MAGENTA })
		button('show_reset', 'Show', 'Cue zum Anfang springen', '↺\nRESET', 'reset_all')
		button('show_repeat', 'Show', 'Loop all (alle wiederholen)', '', 'repeat_all', { mode: 'toggle' }, [
			{ feedbackId: 'repeat_all', options: {}, style: { bgcolor: BLUE, color: BLACK, png64: ICONS.loopBlack } },
		], { png64: ICONS.loopWhite })
		button('show_frame_prev', 'Show', 'Ein Bild zurück (markierter Cue)', '◀|\nFRAME', 'frame_step', { dir: 'prev', frames: 1 })
		button('show_frame_next', 'Show', 'Ein Bild vor (markierter Cue)', '|▶\nFRAME', 'frame_step', { dir: 'next', frames: 1 })
		button('show_freeze', 'Show', 'Freeze all an/aus', '', 'freeze_all', { mode: 'toggle' }, [
			{ feedbackId: 'freeze_all', options: {}, style: { bgcolor: ORANGE, color: BLACK, png64: ICONS.freezeBlack } },
		], { png64: ICONS.freezeWhite })
		button('show_testbild', 'Show', 'Testbild an/aus', 'TEST-\nBILD', 'testbild', { mode: 'toggle' }, [
			{ feedbackId: 'testbild', options: {}, style: { bgcolor: ORANGE, color: BLACK } },
		])
		button('show_eye', 'Show', 'Augen-Animation an/aus', '👀', 'idle_eye', { mode: 'toggle' }, [
			{ feedbackId: 'idle_eye', options: {}, style: { bgcolor: GREEN, color: WHITE } },
		], { size: '24' })
		button('all_toggle', 'Alle', 'Alle: Start / Pause', '⏯\nALLE', 'toggle_all', {}, [])
		button('all_stop', 'Alle', 'Alle: Stopp', 'STOPP\nALLE', 'stop_all', {}, [], { bgcolor: MAGENTA })
		button('all_fade', 'Alle', 'Alle: Fade out', 'FADE\nOUT', 'fade_all')
		button('blackout', 'Alle', 'Blackout', 'BLACK\nOUT', 'blackout', { mode: 'toggle' }, [
			{ feedbackId: 'blackout', options: {}, style: { bgcolor: RED, color: WHITE } },
		])

		for (const c of this.state.cues || []) {
			button(`cue_${c.number}`, 'Cues', `Cue ${c.number}: ${c.name}`, `${c.number} · P${c.player}\n${v(`cue_${c.number}_short`)}`, 'cue', { index: c.number }, [
				{ feedbackId: 'cue_running', options: { index: c.number }, style: { bgcolor: GREEN, color: WHITE } },
			], { bgcolor: CUEBLUE })
		}
		for (const g of this.state.groups || []) {
			button(`group_${g.number}`, 'Gruppen', `Gruppe ${g.number}: ${g.name}`, `▶ ${g.cues} Cues\n${v(`group_${g.number}_short`)}`, 'group', { index: g.number }, [
				{ feedbackId: 'group_running', options: { index: g.number }, style: { bgcolor: GREEN, color: WHITE } },
			], { bgcolor: CUEBLUE })
		}
		return presets
	}
}

runEntrypoint(BInPlayInstance, [])
