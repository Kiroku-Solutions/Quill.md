const PALETTE = [
	'#e06c75', // Red
	'#98c379', // Green
	'#d19a66', // Orange
	'#61afef', // Blue
	'#c678dd', // Purple
	'#56b6c2', // Cyan
	'#e5c07b', // Yellow
	'#f44336', // Bright Red
	'#4caf50', // Bright Green
	'#2196f3', // Bright Blue
	'#9c27b0', // Bright Purple
	'#00bcd4' // Bright Cyan
];

/**
 * Assigns a deterministic color from the palette based on the given client ID.
 */
export function deterministicColor(clientId: number): string {
	return PALETTE[clientId % PALETTE.length] ?? PALETTE[0];
}
