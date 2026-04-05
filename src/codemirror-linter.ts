import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, hoverTooltip } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type { TextlintMessage } from "./textlint-service";

/** Dispatch this effect to push new lint results into the editor. */
export const setTextlintDiagnostics = StateEffect.define<TextlintMessage[]>();

// ── Message store ─────────────────────────────────────────────────────────────

/** Keeps the raw messages so the hover tooltip can query them by position. */
const textlintMessages = StateField.define<TextlintMessage[]>({
	create: () => [],
	update(msgs, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setTextlintDiagnostics)) return effect.value;
		}
		return msgs;
	},
});

// ── Decoration field ──────────────────────────────────────────────────────────

const textlintField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setTextlintDiagnostics)) {
				deco = buildDecorations(effect.value, tr.newDoc.length);
			}
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

function buildDecorations(messages: TextlintMessage[], docLen: number): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	for (const msg of messages) {
		const from = Math.min(msg.range[0], docLen);
		const rawTo = msg.fix ? msg.fix.range[1] : msg.range[1];
		const to = Math.min(Math.max(rawTo, from + 1), docLen);
		if (from >= to) continue;
		ranges.push(
			Decoration.mark({
				class: msg.severity === 2 ? "textlint-mark-error" : "textlint-mark-warning",
			}).range(from, to)
		);
	}
	ranges.sort((a, b) => a.from - b.from);
	return Decoration.set(ranges);
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────

const textlintHover = hoverTooltip((view, pos) => {
	const messages = view.state.field(textlintMessages);
	const docLen = view.state.doc.length;

	const hits = messages.filter((msg) => {
		const from = Math.min(msg.range[0], docLen);
		const rawTo = msg.fix ? msg.fix.range[1] : msg.range[1];
		const to = Math.min(Math.max(rawTo, from + 1), docLen);
		return pos >= from && pos < to;
	});

	if (hits.length === 0) return null;

	const first = hits[0]!;
	const from = Math.min(first.range[0], docLen);

	return {
		pos: from,
		above: true,
		create() {
			const dom = document.createElement("div");
			dom.className = "textlint-tooltip";
			for (const msg of hits) {
				const row = dom.appendChild(document.createElement("div"));
				row.className = "textlint-tooltip-item";

				const badge = row.appendChild(document.createElement("span"));
				badge.className =
					msg.severity === 2 ? "textlint-tooltip-badge error" : "textlint-tooltip-badge warning";
				badge.textContent = msg.severity === 2 ? "Error" : "Warning";

				const rule = row.appendChild(document.createElement("span"));
				rule.className = "textlint-tooltip-rule";
				rule.textContent = msg.ruleId ?? "";

				const text = row.appendChild(document.createElement("span"));
				text.className = "textlint-tooltip-message";
				text.textContent = msg.message;
			}
			return { dom };
		},
	};
});

// ── Public API ────────────────────────────────────────────────────────────────

export function buildTextlintExtension(): Extension {
	return [textlintMessages, textlintField, textlintHover];
}
