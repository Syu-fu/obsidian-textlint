import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type { TextlintMessage } from "./textlint-service";

/** Dispatch this effect to push new lint results into the editor. */
export const setTextlintDiagnostics = StateEffect.define<TextlintMessage[]>();

const textlintField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		// Keep marks in sync with document changes
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
	// Decoration.set requires ranges sorted by `from`
	ranges.sort((a, b) => a.from - b.from);
	return Decoration.set(ranges);
}

/**
 * Returns the CodeMirror Extension that renders textlint results as
 * inline marks.  Push results via `setTextlintDiagnostics` effect.
 */
export function buildTextlintExtension(): Extension {
	return textlintField;
}
